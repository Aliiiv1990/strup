import os
import datetime
from sqlalchemy.orm import Session
# from pywa import WhatsApp # Placeholder for actual PyWa client
# from pywa.types import Message # Placeholder for PyWa message types for responses

from database_models import SentMessageLog, Contact # Assuming models are accessible
from database_setup import get_db_session # For type hinting db_session_factory

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
    def __init__(self, token: str, phone_number_id: str, db_session_factory):
        """
        Initializes the WhatsAppService.

        Args:
            token (str): WhatsApp API token.
            phone_number_id (str): Business phone number ID.
            db_session_factory (function): A function that returns a new SQLAlchemy session.
        """
        self.api_token = token
        self.phone_number_id = phone_number_id
        self.get_db_session = db_session_factory # Store the factory

        if not self.api_token or not self.phone_number_id:
            raise ValueError("WhatsApp API token and Phone Number ID must be provided.")

        # Initialize PyWa client (using mock for now)
        # self.pywa_client = WhatsApp(phone_id=self.phone_number_id, token=self.api_token)
        self.pywa_client = MockPyWaClient(token=self.api_token, phone_id=self.phone_number_id)
        print(f"WhatsAppService initialized for phone ID {self.phone_number_id}.")

    def _log_sent_message(self,
                          db_session: Session, # Accepts a session for logging
                          recipient_whatsapp_id: str,
                          message_body_snapshot: str,
                          content_name_snapshot: str = "Ad-hoc Text Message",
                          status: str = "unknown",
                          whatsapp_api_message_id: str = None,
                          error_message: str = None,
                          scheduled_message_id: int = None, # Optional
                          is_group_log: bool = False) -> SentMessageLog:
        """Helper to log sent messages to the database using the provided session."""
        
        contact = db_session.query(Contact).filter(Contact.whatsapp_id == recipient_whatsapp_id).first()
        if not contact:
            print(f"Warning: Recipient {recipient_whatsapp_id} not found in Contacts. Logging without link.")
        
        log_entry = SentMessageLog(
            recipient_whatsapp_id=recipient_whatsapp_id,
            message_content_name_snapshot=content_name_snapshot,
            message_body_snapshot=message_body_snapshot,
            status_from_webhook=status,
            whatsapp_message_id_from_api=whatsapp_api_message_id,
            error_message_if_any=error_message,
            sent_time=datetime.datetime.now(datetime.timezone.utc),
            scheduled_message_id=scheduled_message_id, # Will be None if not provided
            is_group_message_log=is_group_log,
        )
        if contact:
            log_entry.recipient_contact = contact

        db_session.add(log_entry)
        try:
            db_session.commit() # Commit through the passed session
            db_session.refresh(log_entry)
            return log_entry
        except Exception as e:
            db_session.rollback()
            print(f"Error logging sent message: {e}")
            raise

    def send_text_message(self,
                          recipient_whatsapp_id: str,
                          message_body: str,
                          preview_url: bool = True,
                          scheduled_message_id: int = None) -> tuple[bool, str | None, SentMessageLog | None]: # scheduled_message_id is optional
        """
        Sends a text message using the PyWa client and logs the attempt.

        Args:
            recipient_whatsapp_id (str): The recipient's WhatsApp ID.
            message_body (str): The text of the message.
            preview_url (bool): Whether to show a URL preview if a link is in the message.
            scheduled_message_id (int, optional): If this message originated from a schedule. Defaults to None.

        Returns:
            tuple[bool, str | None, SentMessageLog | None]:
                (success_status, whatsapp_api_message_id, log_entry)
        """
        log_entry = None
        whatsapp_api_message_id = None
        db = self.get_db_session() # Get a new session for this operation
        try:
            response = self.pywa_client.send_message( # Mock call
                to=recipient_whatsapp_id,
                text=message_body,
                preview_url=preview_url
            )
            whatsapp_api_message_id = response.id
            
            log_entry = self._log_sent_message(
                db_session=db, # Pass the session
                recipient_whatsapp_id=recipient_whatsapp_id,
                message_body_snapshot=message_body,
                status="api_sent",
                whatsapp_api_message_id=whatsapp_api_message_id,
                scheduled_message_id=scheduled_message_id # Pass it here
            )
            print(f"Message sent to {recipient_whatsapp_id}. API ID: {whatsapp_api_message_id}")
            return True, whatsapp_api_message_id, log_entry

        except Exception as e:
            print(f"Error sending message to {recipient_whatsapp_id}: {e}")
            log_entry = self._log_sent_message(
                db_session=db, # Pass the session
                recipient_whatsapp_id=recipient_whatsapp_id,
                message_body_snapshot=message_body,
                status="api_failed",
                error_message=str(e),
                scheduled_message_id=scheduled_message_id # Pass it here
            )
            return False, None, log_entry
        finally:
            db.close() # Close the session obtained for this operation

    def send_template_message(self,
                              recipient_whatsapp_id: str,
                              template_name: str,
                              language_code: str = "en_US",
                              components: list = None,
                              scheduled_message_id: int = None) -> tuple[bool, str | None, SentMessageLog | None]: # scheduled_message_id is optional
        """
        (Placeholder) Sends a pre-approved template message using PyWa and logs the attempt.
        Args:
            scheduled_message_id (int, optional): If this message originated from a schedule. Defaults to None.
        """
        log_entry = None
        whatsapp_api_message_id = None
        message_body_snapshot = f"Template: {template_name}, Lang: {language_code}, Components: {components}"
        db = self.get_db_session() # Get a new session for this operation
        try:
            response = self.pywa_client.send_template( # Mock call
                 to=recipient_whatsapp_id,
                 name=template_name,
                 language=language_code,
                 components=components
            )
            whatsapp_api_message_id = response.id

            log_entry = self._log_sent_message(
                db_session=db, # Pass the session
                recipient_whatsapp_id=recipient_whatsapp_id,
                message_body_snapshot=message_body_snapshot,
                content_name_snapshot=f"Template: {template_name}",
                status="api_sent",
                whatsapp_api_message_id=whatsapp_api_message_id,
                scheduled_message_id=scheduled_message_id # Pass it here
            )
            print(f"Template message '{template_name}' sent to {recipient_whatsapp_id}. API ID: {whatsapp_api_message_id}")
            return True, whatsapp_api_message_id, log_entry

        except Exception as e:
            print(f"Error sending template message '{template_name}' to {recipient_whatsapp_id}: {e}")
            log_entry = self._log_sent_message(
                db_session=db, # Pass the session
                recipient_whatsapp_id=recipient_whatsapp_id,
                message_body_snapshot=message_body_snapshot,
                content_name_snapshot=f"Template: {template_name}",
                status="api_failed",
                error_message=str(e),
                scheduled_message_id=scheduled_message_id # Pass it here
            )
            return False, None, log_entry
        finally:
            db.close() # Close the session


if __name__ == '__main__':
    from database_setup import init_db, get_db_session # get_db_session already imported at top
    from database_models import Contact # For creating a dummy contact

    # Initialize DB (use default SQLite for this example)
    engine = init_db()
    # db_sess for main logic is not strictly needed here as services use factory

    try:
        # Create a dummy contact for testing if it doesn't exist
        with get_db_session() as temp_db: # Use context manager for session
            test_recipient_id = "1112223333"
            contact = temp_db.query(Contact).filter(Contact.whatsapp_id == test_recipient_id).first()
            if not contact:
                contact = Contact(name="Test Service User", whatsapp_id=test_recipient_id)
                temp_db.add(contact)
                temp_db.commit()
                temp_db.refresh(contact)
                print(f"Created dummy contact: {contact}")

        # Initialize service
        # WHATSAPP_API_TOKEN and WHATSAPP_PHONE_NUMBER_ID need to be set as env vars
        # or passed directly for testing.
        api_token_env = os.environ.get("WHATSAPP_API_TOKEN", "dummy_token_from_main_ws")
        phone_id_env = os.environ.get("WHATSAPP_PHONE_NUMBER_ID", "dummy_phone_id_from_main_ws")

        if api_token_env == "dummy_token_from_main_ws" or phone_id_env == "dummy_phone_id_from_main_ws":
            print("Warning: Using dummy token/phone_id for WhatsAppService. Set WHATSAPP_API_TOKEN and WHATSAPP_PHONE_NUMBER_ID env vars for real tests.")

        # Instantiate WhatsAppService with the factory
        service = WhatsAppService(
            token=api_token_env,
            phone_number_id=phone_id_env,
            db_session_factory=get_db_session
        )

        # 1. Send a successful text message (chatbot-like, no schedule ID)
        print("\n--- Test 1: Send successful text message (no scheduled_id) ---")
        success, api_id, log = service.send_text_message(test_recipient_id, "Hello from WhatsAppService (chatbot reply)! This is a test.")
        print(f"Send Result: Success={success}, API_ID={api_id}")
        if log:
            print(f"Log Entry: ID={log.id}, Status={log.status_from_webhook}, API_MSG_ID={log.whatsapp_message_id_from_api}, ScheduledID={log.scheduled_message_id}")

        # 2. Send a successful text message (WITH a scheduled_id)
        print("\n--- Test 2: Send successful text message (WITH scheduled_id) ---")
        dummy_schedule_id = 999
        success_sched, api_id_sched, log_sched = service.send_text_message(
            test_recipient_id, 
            "Hello from WhatsAppService (scheduled)! This is a test.",
            scheduled_message_id=dummy_schedule_id
            )
        print(f"Send Result: Success={success_sched}, API_ID={api_id_sched}")
        if log_sched:
            print(f"Log Entry: ID={log_sched.id}, Status={log_sched.status_from_webhook}, API_MSG_ID={log_sched.whatsapp_message_id_from_api}, ScheduledID={log_sched.scheduled_message_id}")

        # 3. Send a failing text message
        print("\n--- Test 3: Send failing text message ---")
        success_fail, api_id_fail, log_fail = service.send_text_message(test_recipient_id, "This message will fail.")
        print(f"Send Result: Success={success_fail}, API_ID={api_id_fail}")
        if log_fail:
            print(f"Log Entry: ID={log_fail.id}, Status={log_fail.status_from_webhook}, Error='{log_fail.error_message_if_any}', ScheduledID={log_fail.scheduled_message_id}")
        
        # 4. Send a successful template message (mocked, no scheduled_id)
        print("\n--- Test 4: Send successful template message (no scheduled_id) ---")
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
            print(f"Log Entry: ID={templ_log.id}, Status={templ_log.status_from_webhook}, API_MSG_ID={templ_log.whatsapp_message_id_from_api}, ScheduledID={templ_log.scheduled_message_id}")

        # Verify logs in DB for this run
        print("\n--- DB Verification (last 4 SentMessageLog entries for this run) ---")
        with get_db_session() as verify_db:
            all_logs = verify_db.query(SentMessageLog).order_by(SentMessageLog.id.desc()).limit(4).all()
            for l_entry in reversed(all_logs): # Print in order of creation for this test
                print(f"DB Log: ID={l_entry.id}, Recipient={l_entry.recipient_whatsapp_id}, Status={l_entry.status_from_webhook}, ScheduledID={l_entry.scheduled_message_id}, Error='{l_entry.error_message_if_any}'")

    except Exception as e:
        print(f"An error occurred during WhatsAppService example: {e}")
    # No explicit db_sess.close() needed here as sessions are managed by context manager or per-call
    print("\nWhatsAppService example finished.")
