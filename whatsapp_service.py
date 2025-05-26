import os
import datetime
from sqlalchemy.orm import Session
# from pywa import WhatsApp # Placeholder for actual PyWa client
# from pywa.types import Message # Placeholder for PyWa message types for responses

from database_models import SentMessageLog, Contact # Assuming models are accessible

# Placeholder for PyWa client and its response types
# Replace with actual PyWa imports and usage when PyWa is integrated.
class MockPyWaClient:
    def __init__(self, token, phone_id):
        self.token = token
        self.phone_id = phone_id
        print(f"MockPyWaClient initialized with token: {token[:5]}... and phone_id: {phone_id}")

    def send_message(self, to: str, text: str, preview_url: bool = True):
        print(f"MockPyWa: Sending text message to {to}: '{text}' (preview: {preview_url})")
        # Simulate a successful API call
        if "fail" in text.lower(): # Simple way to simulate failure for testing
             raise Exception("MockPyWa: Simulated API Error")
        # Simulate a response that might include a message ID
        class MockMessageSent:
            def __init__(self, id):
                self.id = id
                self.message_id = id # More common attribute name in some SDKs
                self.status = "sent" # PyWa might have a different structure

        return MockMessageSent(id=f"wamid.mock_{datetime.datetime.now().timestamp()}")

    def send_template(self, to: str, name: str, language: str, components: list = None):
        print(f"MockPyWa: Sending template '{name}' to {to} (lang: {language}, components: {components})")
        if "fail" in name.lower():
            raise Exception("MockPyWa: Simulated Template API Error")
        class MockTemplateSent:
            def __init__(self, id):
                self.id = id
                self.message_id = id
                self.status = "sent"
        return MockTemplateSent(id=f"wamid.mock_template_{datetime.datetime.now().timestamp()}")

class WhatsAppService:
    def __init__(self, db_session: Session, api_token: str = None, phone_number_id: str = None):
        """
        Initializes the WhatsAppService.

        Args:
            db_session (Session): SQLAlchemy session for database operations.
            api_token (str, optional): WhatsApp API token. Defaults to env var WHATSAPP_API_TOKEN.
            phone_number_id (str, optional): Business phone number ID. Defaults to env var WHATSAPP_PHONE_NUMBER_ID.
        """
        self.db = db_session
        self.api_token = api_token or os.environ.get("WHATSAPP_API_TOKEN", "dummy_token")
        self.phone_number_id = phone_number_id or os.environ.get("WHATSAPP_PHONE_NUMBER_ID", "dummy_phone_id")

        if not self.api_token or not self.phone_number_id:
            raise ValueError("WhatsApp API token and Phone Number ID must be provided or set as environment variables.")

        # Initialize PyWa client (using mock for now)
        # self.pywa_client = WhatsApp(phone_id=self.phone_number_id, token=self.api_token)
        self.pywa_client = MockPyWaClient(token=self.api_token, phone_id=self.phone_number_id)
        print("WhatsAppService initialized.")

    def _log_sent_message(self, 
                          recipient_whatsapp_id: str,
                          message_body_snapshot: str,
                          content_name_snapshot: str = "Ad-hoc Text Message",
                          status: str = "unknown", 
                          whatsapp_api_message_id: str = None,
                          error_message: str = None,
                          scheduled_message_id: int = None,
                          is_group_log: bool = False) -> SentMessageLog:
        """Helper to log sent messages to the database."""
        
        # Ensure recipient contact exists or create a placeholder
        contact = self.db.query(Contact).filter(Contact.whatsapp_id == recipient_whatsapp_id).first()
        if not contact:
            # This is a simplified handling. In a real app, you might want to
            # create a basic contact profile or link to an "unknown" contact.
            # For now, we'll proceed but this highlights a data integrity consideration.
            print(f"Warning: Recipient {recipient_whatsapp_id} not found in Contacts. Logging without link.")
        
        log_entry = SentMessageLog(
            recipient_whatsapp_id=recipient_whatsapp_id,
            message_content_name_snapshot=content_name_snapshot,
            message_body_snapshot=message_body_snapshot,
            status_from_webhook=status, # Initial status; will be updated by webhooks
            whatsapp_message_id_from_api=whatsapp_api_message_id,
            error_message_if_any=error_message,
            sent_time=datetime.datetime.now(datetime.timezone.utc),
            scheduled_message_id=scheduled_message_id,
            is_group_message_log=is_group_log,
            # recipient_contact_id will be set by relationship if contact is found and relationship is configured
        )
        if contact: # Link if contact was found
            log_entry.recipient_contact = contact

        self.db.add(log_entry)
        try:
            self.db.commit()
            self.db.refresh(log_entry)
            return log_entry
        except Exception as e:
            self.db.rollback()
            print(f"Error logging sent message: {e}")
            # Depending on policy, you might re-raise or handle
            raise

    def send_text_message(self, 
                          recipient_whatsapp_id: str, 
                          message_body: str, 
                          preview_url: bool = True,
                          scheduled_message_id: int = None) -> tuple[bool, str | None, SentMessageLog | None]:
        """
        Sends a text message using the PyWa client and logs the attempt.

        Args:
            recipient_whatsapp_id (str): The recipient's WhatsApp ID.
            message_body (str): The text of the message.
            preview_url (bool): Whether to show a URL preview if a link is in the message.
            scheduled_message_id (int, optional): If this message originated from a schedule.

        Returns:
            tuple[bool, str | None, SentMessageLog | None]: 
                (success_status, whatsapp_api_message_id, log_entry)
        """
        log_entry = None
        whatsapp_api_message_id = None
        try:
            # response = self.pywa_client.send_message( # Actual PyWa call
            #     to=recipient_whatsapp_id,
            #     text=message_body,
            #     preview_url=preview_url
            # )
            response = self.pywa_client.send_message( # Mock call
                to=recipient_whatsapp_id,
                text=message_body,
                preview_url=preview_url
            )
            whatsapp_api_message_id = response.id # Or response.message_id depending on PyWa
            
            log_entry = self._log_sent_message(
                recipient_whatsapp_id=recipient_whatsapp_id,
                message_body_snapshot=message_body,
                status="api_sent", # Or map from PyWa response status
                whatsapp_api_message_id=whatsapp_api_message_id,
                scheduled_message_id=scheduled_message_id
            )
            print(f"Message sent to {recipient_whatsapp_id}. API ID: {whatsapp_api_message_id}")
            return True, whatsapp_api_message_id, log_entry

        except Exception as e:
            print(f"Error sending message to {recipient_whatsapp_id}: {e}")
            log_entry = self._log_sent_message(
                recipient_whatsapp_id=recipient_whatsapp_id,
                message_body_snapshot=message_body,
                status="api_failed",
                error_message=str(e),
                scheduled_message_id=scheduled_message_id
            )
            return False, None, log_entry

    def send_template_message(self, 
                              recipient_whatsapp_id: str, 
                              template_name: str, 
                              language_code: str = "en_US", 
                              components: list = None,
                              scheduled_message_id: int = None) -> tuple[bool, str | None, SentMessageLog | None]:
        """
        (Placeholder) Sends a pre-approved template message using PyWa and logs the attempt.

        Args:
            recipient_whatsapp_id (str): The recipient's WhatsApp ID.
            template_name (str): The name of the pre-approved template.
            language_code (str): Language code for the template (e.g., 'en_US').
            components (list, optional): Components for template variables (e.g., header, body, buttons).
            scheduled_message_id (int, optional): If this message originated from a schedule.

        Returns:
            tuple[bool, str | None, SentMessageLog | None]: 
                (success_status, whatsapp_api_message_id, log_entry)
        """
        log_entry = None
        whatsapp_api_message_id = None
        message_body_snapshot = f"Template: {template_name}, Lang: {language_code}, Components: {components}"
        try:
            # response = self.pywa_client.send_template( # Actual PyWa call
            #     to=recipient_whatsapp_id,
            #     name=template_name,
            #     language=language_code,
            #     components=components
            # )
            response = self.pywa_client.send_template( # Mock call
                 to=recipient_whatsapp_id,
                 name=template_name,
                 language=language_code,
                 components=components
            )
            whatsapp_api_message_id = response.id # Or response.message_id

            log_entry = self._log_sent_message(
                recipient_whatsapp_id=recipient_whatsapp_id,
                message_body_snapshot=message_body_snapshot, # Or fetch actual rendered template if possible
                content_name_snapshot=f"Template: {template_name}",
                status="api_sent", # Or map from PyWa response status
                whatsapp_api_message_id=whatsapp_api_message_id,
                scheduled_message_id=scheduled_message_id
            )
            print(f"Template message '{template_name}' sent to {recipient_whatsapp_id}. API ID: {whatsapp_api_message_id}")
            return True, whatsapp_api_message_id, log_entry

        except Exception as e:
            print(f"Error sending template message '{template_name}' to {recipient_whatsapp_id}: {e}")
            log_entry = self._log_sent_message(
                recipient_whatsapp_id=recipient_whatsapp_id,
                message_body_snapshot=message_body_snapshot,
                content_name_snapshot=f"Template: {template_name}",
                status="api_failed",
                error_message=str(e),
                scheduled_message_id=scheduled_message_id
            )
            return False, None, log_entry


if __name__ == '__main__':
    from database_setup import init_db, get_db_session
    from database_models import Contact # For creating a dummy contact

    # Initialize DB (use default SQLite for this example)
    engine = init_db()
    db_sess = get_db_session()

    try:
        # Create a dummy contact for testing if it doesn't exist
        test_recipient_id = "1112223333" # Replace with a real testable WA ID if you have one for PyWa
        contact = db_sess.query(Contact).filter(Contact.whatsapp_id == test_recipient_id).first()
        if not contact:
            contact = Contact(name="Test Service User", whatsapp_id=test_recipient_id)
            db_sess.add(contact)
            db_sess.commit()
            db_sess.refresh(contact)
            print(f"Created dummy contact: {contact}")

        # Initialize service
        # Set WHATSAPP_API_TOKEN and WHATSAPP_PHONE_NUMBER_ID in your env for this to run
        # or pass them directly for testing.
        # For this example, we'll rely on the dummy defaults in the constructor if env vars are not set.
        try:
            service = WhatsAppService(db_session=db_sess) # Uses dummy token/ID if env vars not set
        except ValueError as ve:
            print(f"Setup Error: {ve}")
            print("Please set WHATSAPP_API_TOKEN and WHATSAPP_PHONE_NUMBER_ID environment variables or pass them to WhatsAppService.")
            exit()


        # 1. Send a successful text message
        print("\n--- Test 1: Send successful text message ---")
        success, api_id, log = service.send_text_message(test_recipient_id, "Hello from WhatsAppService! This is a test.")
        print(f"Send Result: Success={success}, API_ID={api_id}")
        if log:
            print(f"Log Entry: ID={log.id}, Status={log.status_from_webhook}, API_MSG_ID={log.whatsapp_message_id_from_api}")

        # 2. Send a failing text message
        print("\n--- Test 2: Send failing text message ---")
        success_fail, api_id_fail, log_fail = service.send_text_message(test_recipient_id, "This message will fail.")
        print(f"Send Result: Success={success_fail}, API_ID={api_id_fail}")
        if log_fail:
            print(f"Log Entry: ID={log_fail.id}, Status={log_fail.status_from_webhook}, Error='{log_fail.error_message_if_any}'")
        
        # 3. Send a successful template message (mocked)
        print("\n--- Test 3: Send successful template message ---")
        components_example = [
            {"type": "header", "parameters": [{"type": "text", "text": "Amazing Offer!"}]},
            {"type": "body", "parameters": [{"type": "text", "text": "John Doe"}]}
        ]
        templ_success, templ_api_id, templ_log = service.send_template_message(
            test_recipient_id, 
            "my_awesome_promo", 
            "en_US", 
            components_example
        )
        print(f"Template Send Result: Success={templ_success}, API_ID={templ_api_id}")
        if templ_log:
            print(f"Log Entry: ID={templ_log.id}, Status={templ_log.status_from_webhook}, API_MSG_ID={templ_log.whatsapp_message_id_from_api}")

        # 4. Send a failing template message (mocked)
        print("\n--- Test 4: Send failing template message ---")
        templ_fail_success, templ_fail_api_id, templ_fail_log = service.send_template_message(
            test_recipient_id, 
            "this_template_will_fail", 
            "en_US"
        )
        print(f"Template Send Result: Success={templ_fail_success}, API_ID={templ_fail_api_id}")
        if templ_fail_log:
            print(f"Log Entry: ID={templ_fail_log.id}, Status={templ_fail_log.status_from_webhook}, Error='{templ_fail_log.error_message_if_any}'")


        # Verify logs in DB
        print("\n--- DB Verification: SentMessageLog entries ---")
        all_logs = db_sess.query(SentMessageLog).order_by(SentMessageLog.id.desc()).limit(4).all()
        for l in reversed(all_logs): # Print in order of creation for this test
            print(f"DB Log: ID={l.id}, Recipient={l.recipient_whatsapp_id}, Status={l.status_from_webhook}, API_ID={l.whatsapp_message_id_from_api}, Error='{l.error_message_if_any}'")

    except Exception as e:
        print(f"An error occurred during WhatsAppService example: {e}")
    finally:
        db_sess.close()
        print("\nWhatsAppService example finished. DB session closed.")
