# chatbot_service.py

import datetime
from sqlalchemy.orm import Session

# Assuming these modules are in the same directory or Python path
from database_models import ReceivedMessageLog, MessageContent 
from whatsapp_service import WhatsAppService # For sending replies
from database_setup import get_db_session # For type hinting and session management

class ChatbotService:
    def __init__(self, whatsapp_service: WhatsAppService, db_session_factory):
        """
        Initializes the ChatbotService.

        Args:
            whatsapp_service (WhatsAppService): An instance of WhatsAppService to send replies.
            db_session_factory (function): A function that returns a new SQLAlchemy session
                                          (e.g., database_setup.get_db_session).
        """
        self.whatsapp_service = whatsapp_service
        self.get_db_session = db_session_factory
        
        # Simple hardcoded rules
        # In a real application, these might come from a database, config file, or a more advanced rule engine.
        self.rules = [
            {
                "name": "Greeting Rule (Salam)",
                "keywords": ["سلام", "وقت بخیر", "روز بخیر", "صبح بخیر", "عصر بخیر"],
                "response_text": "سلام! چطور میتونم کمکتون کنم؟ 😊",
                "match_type": "any" # 'any' means any keyword match
            },
            {
                "name": "Thank You Rule",
                "keywords": ["ممنون", "متشکرم", "مرسی", "تشکر"],
                "response_text": "خواهش میکنم! خوشحالم که تونستم کمک کنم. 🙏",
                "match_type": "any"
            },
            {
                "name": "Goodbye Rule",
                "keywords": ["خداحافظ", "خدانگهدار", "فعلا", "بعدا میبینمت"],
                "response_text": "خدانگهدار! روز خوبی داشته باشید. 👋",
                "match_type": "any"
            },
            {
                "name": "Help/Support Rule",
                "keywords": ["کمک", "پشتیبانی", "راهنمایی", "مشکل"],
                "response_text": "برای دریافت پشتیبانی، لطفا مشکل خود را با جزئیات شرح دهید یا با شماره  تماس بگیرید.",
                "match_type": "any"
            },
            {
                "name": "Product Inquiry Rule",
                "keywords": ["محصول", "کالا", "سفارش", "خرید", "قیمت"],
                "response_text": "برای اطلاعات بیشتر در مورد محصولات و قیمت‌ها، لطفا به وبسایت ما مراجعه کنید: example.com/products",
                "match_type": "any"
            },
            # Add more rules as needed
        ]
        print("ChatbotService initialized with hardcoded rules.")

    def _normalize_text_simple(self, text: str) -> str:
        """
        Simple text normalization for basic keyword matching.
        - Converts to lowercase (Persian doesn't have case, but good practice for mixed scenarios).
        - Removes some common punctuation for basic matching.
        This is NOT a replacement for Hazm or proper NLP normalization.
        """
        if not text:
            return ""
        text = text.lower()
        # Basic punctuation removal - extend as needed
        punctuation_to_remove = ".,!؟?;:"
        for punc in punctuation_to_remove:
            text = text.replace(punc, " ")
        # Replace multiple spaces with a single space
        text = " ".join(text.split())
        return text.strip()

    def process_message(self, received_message: ReceivedMessageLog) -> bool:
        """
        Processes an incoming message based on defined rules and sends a response if a rule matches.

        Args:
            received_message (ReceivedMessageLog): The message object from the database.

        Returns:
            bool: True if a response was sent, False otherwise.
        """
        if not received_message.message_body_text:
            print(f"[ChatbotService] Message ID {received_message.id} has no text body, skipping rule processing.")
            return False

        # Normalize incoming message text for more robust matching
        # For true Persian normalization, Hazm would be used here.
        # This is a very simplified version.
        message_text_normalized = self._normalize_text_simple(received_message.message_body_text)
        
        print(f"[ChatbotService] Processing message ID {received_message.id}: '{message_text_normalized}'")

        for rule in self.rules:
            matched = False
            if rule["match_type"] == "any":
                for keyword in rule["keywords"]:
                    # Normalize keyword as well for consistent matching
                    normalized_keyword = self._normalize_text_simple(keyword)
                    if normalized_keyword in message_text_normalized: # Check if normalized keyword is part of normalized message
                        matched = True
                        break
            elif rule["match_type"] == "exact": # Not used in current rules but example
                normalized_rule_keywords_string = " ".join(self._normalize_text_simple(k) for k in rule["keywords"])
                if message_text_normalized == normalized_rule_keywords_string:
                    matched = True
            
            if matched:
                print(f"[ChatbotService] Rule '{rule['name']}' matched for message ID {received_message.id}.")
                
                # Ensure WhatsAppService uses a valid session for logging.
                # If WhatsAppService is initialized with a session factory, it can get its own session.
                # Or, if its methods accept a session, pass it.
                # For this example, assuming WhatsAppService handles its session internally.
                
                success, api_msg_id, log_entry = self.whatsapp_service.send_text_message(
                    recipient_whatsapp_id=received_message.sender_whatsapp_id,
                    message_body=rule["response_text"]
                    # We are not linking this reply to a "scheduled_message_id" as it's a direct reply.
                )
                
                if success:
                    print(f"[ChatbotService] Response sent for rule '{rule['name']}' to {received_message.sender_whatsapp_id}. API Message ID: {api_msg_id}")
                    # Optionally log the chatbot's action (e.g., to a new table ChatbotActionLog)
                    # For now, the SentMessageLog from WhatsAppService covers the sending part.
                    return True
                else:
                    print(f"[ChatbotService] FAILED to send response for rule '{rule['name']}' to {received_message.sender_whatsapp_id}. Error in WhatsAppService.")
                    # Decide if we should try other rules or stop. For now, stop on first match with send attempt.
                    return False # Indicate an attempt was made but failed

        print(f"[ChatbotService] No rules matched for message ID {received_message.id}.")
        
        # If no basic rules matched, try intent recognition
        intent = self._simulate_intent_recognition(message_text_normalized)
        if intent:
            print(f"[ChatbotService] Intent '{intent}' recognized for message ID {received_message.id}.")
            
            intent_responses = {
                "order_status": [
                    "برای پیگیری وضعیت سفارش، لطفا شماره سفارش خود را وارد کنید.",
                    "حتما، شماره سفارشتون رو بفرمایید تا وضعیتش رو چک کنم.",
                    "می‌تونم وضعیت سفارشتون رو بررسی کنم. شماره سفارش لطفا؟"
                ],
                "request_info": [
                    "چه اطلاعاتی نیاز دارید؟ لطفا سوال خود را دقیق‌تر بپرسید.",
                    "بفرمایید، در مورد چه موضوعی اطلاعات می‌خواهید؟",
                    "در خدمتم. سوالتون رو مطرح کنید تا راهنماییتون کنم."
                ],
                "greeting": [ # Fallback greeting if not caught by basic rules
                    "سلام مجدد! در خدمتم.",
                    "سلام! چطور می‌تونم امروز به شما کمک کنم؟",
                    "وقت بخیر! آماده پاسخگویی به سوالات شما هستم."
                ]
                # Add more intents and their varied responses here
            }
            
            response_text = None
            if intent in intent_responses:
                import random # Ensure import random is at the top of the file
                response_text = random.choice(intent_responses[intent])
            
            if response_text:
                # Ensure WhatsAppService uses a valid session for logging.
                # ChatbotService uses a db_session_factory to get sessions for its operations.
                # It should pass this session to WhatsAppService if its methods require it,
                # or WhatsAppService should use its own factory.
                # The modified WhatsAppService uses its own factory, so this is fine.
                success, api_msg_id, log_entry = self.whatsapp_service.send_text_message(
                    recipient_whatsapp_id=received_message.sender_whatsapp_id,
                    message_body=response_text
                    # scheduled_message_id is not applicable here
                )
                if success:
                    print(f"[ChatbotService] Response sent for intent '{intent}' to {received_message.sender_whatsapp_id}. API Message ID: {api_msg_id}")
                    # Optionally log the intent recognized and action taken
                    # e.g., db.add(IntentLog(message_id=received_message.id, intent=intent, response=response_text))
                    return True
                else:
                    print(f"[ChatbotService] FAILED to send response for intent '{intent}' to {received_message.sender_whatsapp_id}.")
                    return False # Indicate an attempt was made but failed
            else:
                print(f"[ChatbotService] Intent '{intent}' recognized but no response defined for it.")
                return False # Intent recognized but no action taken
        
        print(f"[ChatbotService] No intent recognized for message ID {received_message.id}.")
        return False

    def _simulate_intent_recognition(self, normalized_text: str) -> str | None:
        """
        Simulates NLP-based intent recognition using keyword patterns.
        In a real system, this would use NLP libraries (Hazm for preprocessing) 
        and a trained model (e.g., from DadmaTools, Rasa NLU, or custom).

        Args:
            normalized_text (str): The preprocessed (normalized) message text.

        Returns:
            str | None: The recognized intent label or None if no intent is recognized.
        """
        # Preprocessing (e.g., tokenization, lemmatization with Hazm) would ideally happen
        # before or at the start of this method in a real scenario.
        # For this simulation, normalized_text is assumed to be a string of space-separated words
        # from _normalize_text_simple.
        
        # print(f"[IntentSim] Analyzing text for intent: '{normalized_text}'") # For debugging

        # Define intent patterns (simple keyword spotting)
        # Keywords should ideally be lemmatized in a real system for better matching.
        intents = {
            "order_status": { # Example: "وضعیت سفارش من کجاست؟" or "پیگیری سفارش"
                "all_of": ["سفارش"], 
                "any_of": ["وضعیت", "کجاست", "پیگیری", "ارسال"] 
            },
            "request_info": { # Example: "اطلاعات بیشتر میخواستم" or "راهنمایی کنید"
                "any_of": ["اطلاعات", "بیشتر", "راهنمایی", "جزئیات", "چطور", "چگونه", "سوال"] 
            },
            "greeting": { # Fallback if not handled by basic rules. Example: "سلام حال شما"
                          # Basic rules are usually more direct matches like just "سلام".
                "any_of": ["سلام", "درود"] # Keeping it simple, could add "وقت بخیر" etc.
                                          # if they aren't primary keywords in basic rules.
            }
            # Add more intents like "cancel_order", "change_address", "product_price_query" etc.
        }

        message_words = set(normalized_text.split())

        for intent_label, conditions in intents.items():
            all_of_present = True
            if "all_of" in conditions:
                if not all(self._normalize_text_simple(kw) in message_words for kw in conditions["all_of"]):
                    all_of_present = False
            
            if not all_of_present:
                continue

            any_of_present = False
            if "any_of" in conditions:
                if any(self._normalize_text_simple(kw) in message_words for kw in conditions["any_of"]):
                    any_of_present = True
            elif "all_of" in conditions : # If only "all_of" is defined, "any_of" part is met by default
                any_of_present = True
            # If neither "all_of" nor "any_of" is present, it implies the intent matches by default (not typical)
            # or if "any_of" is the only condition.

            if any_of_present: # This means all "all_of" (if any) AND at least one "any_of" (if any) are present
                return intent_label

        return None # No intent recognized

    def _conceptual_dialog_management_notes(self):
        """
        Conceptual Outline for Dialog Management (State Tracking) - Not Implemented

        1. Need for State:
           - Many chatbot interactions are multi-turn. For example:
             - User: "وضعیت سفارش من؟" (Intent: order_status)
             - Bot: "برای پیگیری وضعیت سفارش، لطفا شماره سفارش خود را وارد کنید." (Sets state: awaiting_order_number)
             - User: "12345" (Bot needs to know it's expecting an order number from this user)
             - Bot: "سفارش شما با شماره 12345 در تاریخ ... ارسال شده است."
           - Without state, the bot treats every message as new, unable to remember previous context or questions it asked.
           - State is needed to:
             - Understand follow-up messages correctly.
             - Ask clarifying questions and process the answers.
             - Guide the user through a process (e.g., booking, troubleshooting).
             - Personalize responses based on recent interaction.

        2. Simple State Storage (Conceptual):
           - In-Memory Dictionary (for very simple, single-process/thread bots, not scalable or persistent):
             `user_states = { "whatsapp_id_1": {"current_intent": "order_status", "awaiting": "order_number", "data": {}, "timestamp": ...}, ... }`
           - Database Table (More Robust):
             A new SQLAlchemy model, e.g., `ConversationState`:
               - `id` (PK)
               - `user_whatsapp_id` (String, FK to Contact.whatsapp_id, Indexed)
               - `current_intent` (String, nullable=True) - The intent that triggered the current state.
               - `active_state_key` (String, nullable=True) - e.g., "awaiting_order_number", "awaiting_location_for_delivery".
               - `state_data_json` (JSON, nullable=True) - To store any data collected during the conversation (e.g., partial form data).
               - `last_updated_timestamp` (DateTime, auto-updated)
             This allows persistence, scalability across multiple workers, and easier querying/management.

        3. State Transitions:
           - An intent recognition (or a specific rule match) can trigger a state change.
           - Example: If `_simulate_intent_recognition` detects "order_status", and the bot decides to ask for an order number,
             it would also update/create a state entry for the user:
             `user_whatsapp_id = "...", current_intent = "order_status", active_state_key = "awaiting_order_number", timestamp = now()`
           - When the next message from this user arrives, `process_message` would first check if an active state exists for the user.
             - If `active_state_key == "awaiting_order_number"`, the message is interpreted as the order number.
             - The bot then attempts to fulfill the original intent ("order_status") using this new information.
             - After fulfillment (or failure), the state is typically cleared or transitioned.

        4. State Processing Logic (in `process_message` - conceptual):
           ```python
           # Conceptual flow within process_message:
           # db = self.get_db_session()
           # current_state = db.query(ConversationState).filter_by(user_whatsapp_id=sender_id).first()
           #
           # if current_state and current_state.active_state_key == "awaiting_order_number":
           #     order_number = received_message.message_body_text
           #     # ... process order_number, then clear or update state ...
           #     # response_text = f"Processing order number {order_number}..."
           #     # db.delete(current_state) or current_state.active_state_key = None
           #     # db.commit()
           # else:
           #     # ... proceed with normal rule/intent matching ...
           #     # If an intent sets a new state:
           #     if intent == "order_status" and requires_order_number:
           #         # response_text = "Please provide your order number."
           #         # new_state = ConversationState(user_whatsapp_id=sender_id, active_state_key="awaiting_order_number", ...)
           #         # db.add(new_state)
           #         # db.commit()
           ```

        5. State Timeout/Reset:
           - States should not persist indefinitely.
           - A timestamp (`last_updated_timestamp`) is crucial.
           - A background job or logic within `process_message` could check if a state has expired (e.g., after 10-15 minutes of inactivity).
           - Expired states should be cleared to prevent unexpected behavior if the user returns to the conversation much later.
           - Users might also need an explicit way to cancel or reset the current operation/state (e.g., by typing "لغو" or "شروع مجدد").

        This conceptual outline serves as a basis for future development of stateful, multi-turn conversation capabilities.
        Actual implementation would require careful design of state structures, transitions, and error handling.
        """
        pass # This method is purely for documentation/notes.


if __name__ == '__main__':
    # Example Usage (requires database_setup, whatsapp_service, and database_models)
    from database_setup import init_db
    from whatsapp_service import WhatsAppService # For initializing ChatbotService
    # Dummy ReceivedMessageLog for testing
    from database_models import Contact

    print("--- ChatbotService Example Usage ---")
    # 1. Initialize Database (uses default SQLite if no env var)
    engine = init_db()
    
    # 2. Initialize Services
    # WhatsAppService needs a DB session for its internal logging
    temp_db_for_wa_service = get_db_session()
    # Ensure WHATSAPP_API_TOKEN and WHATSAPP_PHONE_NUMBER_ID are set in env for WhatsAppService
    os.environ.setdefault("WHATSAPP_API_TOKEN", "dummy_chatbot_token")
    os.environ.setdefault("WHATSAPP_PHONE_NUMBER_ID", "dummy_chatbot_phone_id")
    whatsapp_svc = WhatsAppService(db_session=temp_db_for_wa_service, 
                                   api_token=os.environ["WHATSAPP_API_TOKEN"], 
                                   phone_number_id=os.environ["WHATSAPP_PHONE_NUMBER_ID"])
    
    chatbot_svc = ChatbotService(whatsapp_service=whatsapp_svc, db_session_factory=get_db_session)

    # 3. Create a dummy ReceivedMessageLog object (as if it came from webhook_handler)
    # And a dummy contact
    test_db = get_db_session()
    try:
        sender_id = "1234567890" # Dummy sender
        contact = test_db.query(Contact).filter(Contact.whatsapp_id == sender_id).first()
        if not contact:
            contact = Contact(name="Chatbot Tester", whatsapp_id=sender_id)
            test_db.add(contact)
            test_db.commit()

        # Simulate various incoming messages
        test_messages_data = [
        {"id": 1001, "wa_msg_id": "wamid.test.1", "sender": sender_id, "text": "سلام وقت بخیر"}, # Basic Greeting Rule
        {"id": 1002, "wa_msg_id": "wamid.test.2", "sender": sender_id, "text": "خیلی ممنون از شما"}, # Basic Thank You Rule
        {"id": 1003, "wa_msg_id": "wamid.test.3", "sender": sender_id, "text": "من یک سوال در مورد محصول شما دارم."}, # Basic Product Inquiry Rule
        {"id": 1004, "wa_msg_id": "wamid.test.4", "sender": sender_id, "text": "این پیام هیچکدام از قوانین را ندارد."}, # No Rule, No Intent
        {"id": 1005, "wa_msg_id": "wamid.test.5", "sender": sender_id, "text": "خداحافظ!"}, # Basic Goodbye Rule
            {"id": 1006, "wa_msg_id": "wamid.test.6", "sender": sender_id, "text": None}, # Test no text
        {"id": 1007, "wa_msg_id": "wamid.test.intent.1", "sender": sender_id, "text": "وضعیت سفارش من چیست؟"}, # Intent: order_status
        {"id": 1008, "wa_msg_id": "wamid.test.intent.2", "sender": sender_id, "text": "میخواستم اطلاعات بیشتری کسب کنم"}, # Intent: request_info
        {"id": 1009, "wa_msg_id": "wamid.test.intent.3", "sender": sender_id, "text": "سلام، سفارش من کجاست"}, # Intent: greeting (basic rule) + order_status (intent) -> basic rule takes precedence
        {"id": 1010, "wa_msg_id": "wamid.test.intent.4", "sender": sender_id, "text": "پیگیری سفارش"}, # Intent: order_status
        {"id": 1011, "wa_msg_id": "wamid.test.intent.5", "sender": sender_id, "text": "سلام من به راهنمایی شما نیاز دارم"}, # Intent: greeting (basic rule) + request_info (intent) -> basic rule takes precedence
        ]

        for msg_data in test_messages_data:
            # Create a mock ReceivedMessageLog object (not actually saving to DB for this specific test run)
            # In a real scenario, this object would be fetched from the DB.
            mock_received_log = ReceivedMessageLog(
                id=msg_data["id"], # In real scenario, this is auto-gen by DB
                whatsapp_message_id=msg_data["wa_msg_id"],
                sender_whatsapp_id=msg_data["sender"],
                recipient_whatsapp_id="our_business_num", # Dummy recipient
                message_body_text=msg_data["text"],
                message_type="text" if msg_data["text"] else "unknown",
                received_at_timestamp=datetime.datetime.now(datetime.timezone.utc),
                sender_contact=contact # Link to contact
            )
            # We are not adding this mock_received_log to the session for this test to avoid DB writes
            # during what is primarily a ChatbotService logic test.
            # The WhatsAppService will still attempt to log its sent messages.

            print(f"\n--- Processing Test Message: '{msg_data['text']}' ---")
            was_handled = chatbot_svc.process_message(mock_received_log)
            print(f"Message handled by chatbot: {was_handled}")

    except Exception as e:
        print(f"Error in ChatbotService example: {e}")
    finally:
        test_db.close()
        temp_db_for_wa_service.close() # Close the session passed to WhatsAppService

    print("\n--- ChatbotService Example Usage Finished ---")
