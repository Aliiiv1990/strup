import os
import json
import hmac
import hashlib
import datetime

from flask import Flask, request, abort, jsonify, current_app

from database_setup import get_db_session
from database_models import ReceivedMessageLog, Contact

# --- Configuration ---
# These should be set as environment variables in a production environment
# For local testing, you can set them directly or use a .env file with python-dotenv
WHATSAPP_VERIFY_TOKEN = os.environ.get("WHATSAPP_VERIFY_TOKEN", "my_dummy_verify_token")
WHATSAPP_APP_SECRET = os.environ.get("WHATSAPP_APP_SECRET", "my_dummy_app_secret")


# --- Flask App Initialization ---
# This app instance is created here but might be imported and registered with a main app in a larger structure.
# For this subtask, we'll assume it runs as a standalone Flask app.
app = Flask(__name__)
app.config['WHATSAPP_VERIFY_TOKEN'] = WHATSAPP_VERIFY_TOKEN
app.config['WHATSAPP_APP_SECRET'] = WHATSAPP_APP_SECRET


# --- Service Initialization ---
from whatsapp_service import WhatsAppService
from chatbot_service import ChatbotService
# Assuming database_setup.get_db_session is already imported

# Configurations for services
# WHATSAPP_APP_SECRET from app.config will be used as API token by WhatsAppService via ChatbotService integration.
# WHATSAPP_PHONE_NUMBER_ID needs to be consistently defined, e.g., from environment.
# For simplicity, webhook_handler.py now directly uses os.getenv for these,
# matching the pattern in the modified WhatsAppService.

WHATSAPP_API_TOKEN_CONFIG = os.getenv("WHATSAPP_API_TOKEN", app.config.get('WHATSAPP_APP_SECRET')) # Use App Secret as token if not specified
WHATSAPP_PHONE_NUMBER_ID_CONFIG = os.getenv("WHATSAPP_PHONE_NUMBER_ID", "dummy_phone_id_webhook")

if WHATSAPP_API_TOKEN_CONFIG == "my_dummy_app_secret" or WHATSAPP_PHONE_NUMBER_ID_CONFIG == "dummy_phone_id_webhook":
    print("Warning: Using dummy values for WHATSAPP_API_TOKEN or WHATSAPP_PHONE_NUMBER_ID in webhook_handler.")

db_session_factory = get_db_session

whatsapp_service_instance = WhatsAppService(
    token=WHATSAPP_API_TOKEN_CONFIG,
    phone_number_id=WHATSAPP_PHONE_NUMBER_ID_CONFIG,
    db_session_factory=db_session_factory
)

chatbot_service_instance = ChatbotService(
    whatsapp_service=whatsapp_service_instance,
    db_session_factory=db_session_factory
)
print("WhatsAppService and ChatbotService initialized globally in webhook_handler.")

# --- Webhook Routes ---
@app.route('/webhook', methods=['GET', 'POST'])
def webhook_listener():
    if request.method == 'GET':
        # WhatsApp Webhook Verification
        verify_token = request.args.get('hub.verify_token')
        if request.args.get('hub.mode') == 'subscribe' and verify_token == current_app.config['WHATSAPP_VERIFY_TOKEN']:
            challenge = request.args.get('hub.challenge')
            print(f"GET /webhook - Verification successful. Challenge: {challenge}")
            return challenge, 200
        else:
            print(f"GET /webhook - Verification failed. Mode: {request.args.get('hub.mode')}, Token: {verify_token}")
            abort(403)  # Forbidden

    elif request.method == 'POST':
        # WhatsApp Message Notification
        
        # 1. Signature Validation
        signature = request.headers.get('X-Hub-Signature-256')
        if not signature:
            print("POST /webhook - Error: Missing X-Hub-Signature-256 header.")
            abort(401) # Unauthorized

        # Remove 'sha256=' prefix
        signature_hash = signature.split('=')[-1]
        
        # Calculate expected hash
        expected_hash = hmac.new(
            current_app.config['WHATSAPP_APP_SECRET'].encode('utf-8'),
            request.data, # request.data is the raw request body bytes
            hashlib.sha256
        ).hexdigest()

        if not hmac.compare_digest(expected_hash, signature_hash):
            print(f"POST /webhook - Error: Invalid signature. Expected: {expected_hash}, Got: {signature_hash}")
            abort(401) # Unauthorized

        print("POST /webhook - Signature validated successfully.")
        
        # 2. Payload Processing
        payload_json = request.get_json()
        if not payload_json:
            print("POST /webhook - Error: Invalid JSON payload.")
            abort(400) # Bad Request
        
        # Log the raw payload for debugging (optional, be mindful of sensitive data in production)
        # print(f"Raw payload: {json.dumps(payload_json, indent=2)}")

        db = get_db_session()
        try:
            # WhatsApp Cloud API typically sends an object with an 'entry' list,
            # and each entry has a 'changes' list.
            # A message notification is usually in changes[0].value.messages[0]
            if payload_json.get("object") == "whatsapp_business_account":
                for entry in payload_json.get("entry", []):
                    for change in entry.get("changes", []):
                        value = change.get("value", {})
                        if value.get("messaging_product") == "whatsapp":
                            
                            # Process contacts (sender)
                            if "contacts" in value:
                                for contact_data in value.get("contacts", []):
                                    wa_id = contact_data.get("wa_id")
                                    profile_name = contact_data.get("profile", {}).get("name", "Unknown Contact")
                                    
                                    contact = db.query(Contact).filter(Contact.whatsapp_id == wa_id).first()
                                    if not contact:
                                        contact = Contact(whatsapp_id=wa_id, name=profile_name)
                                        db.add(contact)
                                        print(f"New contact created: {wa_id} ({profile_name})")
                                    elif contact.name != profile_name and profile_name != "Unknown Contact":
                                        contact.name = profile_name # Update name if changed
                                        print(f"Contact name updated for {wa_id} to {profile_name}")
                                    db.flush() # Use flush to get ID if needed before commit, or commit later

                            # Process messages
                            if "messages" in value:
                                for message_data in value.get("messages", []):
                                    sender_wa_id = message_data.get("from")
                                    message_id_from_api = message_data.get("id")
                                    message_type = message_data.get("type")
                                    timestamp_from_api_str = message_data.get("timestamp") # Unix timestamp string
                                    
                                    whatsapp_timestamp = None
                                    if timestamp_from_api_str:
                                        try:
                                            whatsapp_timestamp = datetime.datetime.fromtimestamp(int(timestamp_from_api_str), tz=datetime.timezone.utc)
                                        except ValueError:
                                            print(f"Warning: Could not parse WhatsApp timestamp: {timestamp_from_api_str}")

                                    message_body = None
                                    media_url = None # Placeholder for actual media URL extraction

                                    if message_type == "text":
                                        message_body = message_data.get("text", {}).get("body")
                                    elif message_type in ["image", "audio", "video", "document", "sticker"]:
                                        # Actual media URL retrieval might require another API call using media ID
                                        # or it might be directly in the payload for some cases (less common for Cloud API directly).
                                        # For now, we'll log the type. The media ID would be in message_data.get(message_type, {}).get("id")
                                        media_info = message_data.get(message_type, {})
                                        message_body = media_info.get("caption") # If media has a caption
                                        # media_url = "placeholder_media_url_from_id_" + media_info.get("id", "")
                                        print(f"Received media message of type '{message_type}'. ID: {media_info.get('id')}")
                                    # Add more elif for other types: location, contacts, etc.
                                    
                                    # Ensure sender contact exists (it should have been created/updated above from 'contacts' array if provided by WA)
                                    sender_contact_obj = db.query(Contact).filter(Contact.whatsapp_id == sender_wa_id).first()
                                    if not sender_contact_obj:
                                        # This might happen if the 'contacts' array in the payload is missing or processed differently
                                        sender_contact_obj = Contact(whatsapp_id=sender_wa_id, name=sender_wa_id) # Create basic contact
                                        db.add(sender_contact_obj)
                                        print(f"Fallback: New contact created for sender ID: {sender_wa_id}")
                                        db.flush() # Ensure it's in session for relationship

                                    # Log to ReceivedMessageLog
                                    log_entry = ReceivedMessageLog(
                                        whatsapp_message_id=message_id_from_api,
                                        sender_whatsapp_id=sender_wa_id,
                                        # recipient_whatsapp_id needs to be determined (e.g., from metadata if multiple numbers)
                                        # For now, using a placeholder or it could be the business phone number ID from the entry.
                                        recipient_whatsapp_id=value.get("metadata", {}).get("phone_number_id", "unknown_recipient_num_id"),
                                        message_body_text=message_body,
                                        media_url_if_any=media_url,
                                        message_type=message_type,
                                        whatsapp_timestamp=whatsapp_timestamp,
                                        # sender_contact=sender_contact_obj # Relationship will be set by SQLAlchemy
                                    )
                                    db.add(log_entry)
                                    db.commit() # Commit log entry and contact changes
                                    db.refresh(log_entry) # To get the ID and other defaults
                                    
                                    print(f"Message from {sender_wa_id} logged to ReceivedMessageLog (ID: {log_entry.id}). Type: {message_type}")

                                    # Pass to ChatbotService for processing
                                    # chatbot_service_instance is globally available now
                                    try:
                                        # The log_entry object is an SQLAlchemy model instance from the current 'db' session.
                                        # ChatbotService.process_message uses its own session factory for its operations,
                                        # including calls to WhatsAppService for sending replies and logging them.
                                        # This is fine as long as process_message doesn't try to modify log_entry
                                        # and commit it using a *different* session. It primarily reads from log_entry.
                                        chatbot_service_instance.process_message(log_entry)
                                    except Exception as e_chatbot:
                                        print(f"Error calling ChatbotService: {e_chatbot}")
                                        # Log this error, but don't abort the 200 OK to WhatsApp
                            
                            # Handle other types of notifications if necessary (e.g., message status updates)
                            # These would be under `value.get("statuses")`
                            if "statuses" in value:
                                for status_data in value.get("statuses", []):
                                    # Process status updates here (e.g., update SentMessageLog)
                                    # For this subtask, we focus on incoming messages.
                                    print(f"Received status update: {status_data}")
                                    pass # Placeholder for status processing

            db.commit() # Commit any pending contact creations/updates from the loop
        except Exception as e:
            db.rollback()
            print(f"POST /webhook - Error processing payload: {e}")
            # Log the error properly in a production system
            # Respond with 500, but WhatsApp prefers 200 quickly.
            # So, it might be better to always return 200 after attempting to process,
            # and handle errors internally. For now, letting Flask default to 500 on unhandled exceptions.
            abort(500) # Internal Server Error
        finally:
            db.close()

        return jsonify({"status": "success"}), 200


# --- Main Execution (for local testing) ---
if __name__ == '__main__':
    # This allows running the Flask app directly for testing the webhook endpoint.
    # In a production setup, you'd use a WSGI server like Gunicorn.
    
    # Ensure database is initialized
    from database_setup import init_db
    init_db() # Uses default SQLite DB if SQLALCHEMY_DATABASE_URL is not set

    print(f"Starting Flask app for webhook handling on port 5000 (default).")
    print(f"Verify Token: {app.config['WHATSAPP_VERIFY_TOKEN']}")
    print(f"App Secret (first 5 chars): {app.config['WHATSAPP_APP_SECRET'][:5]}...")
    print("Make sure to expose this endpoint via ngrok or similar for WhatsApp to reach it.")
    app.run(debug=True, port=5000) # Port 5000 is common for Flask dev
    # For production: app.run(host='0.0.0.0', port=os.environ.get('PORT', 8080)) without debug mode.

# Example curl for GET (verification):
# curl -X GET "http://localhost:5000/webhook?hub.mode=subscribe&hub.challenge=CHALLENGE_ACCEPTED&hub.verify_token=my_dummy_verify_token"

# Example curl for POST (message notification - requires valid signature and body):
# Needs a tool like Postman or actual WhatsApp notification after setup.
# Body structure example (simplified):
# {
#   "object": "whatsapp_business_account",
#   "entry": [{
#     "id": "BUSINESS_ACCOUNT_ID",
#     "changes": [{
#       "field": "messages",
#       "value": {
#         "messaging_product": "whatsapp",
#         "metadata": {
#           "display_phone_number": "16505551111",
#           "phone_number_id": "PHONE_NUMBER_ID"
#         },
#         "contacts": [{ "profile": { "name": "Test User" }, "wa_id": "16505552222" }],
#         "messages": [{
#           "from": "16505552222",
#           "id": "wamid.MSG_ID",
#           "timestamp": "1600000000",
#           "text": { "body": "Hello world" },
#           "type": "text"
#         }]
#       }
#     }]
#   }]
# }
# Remember to calculate X-Hub-Signature-256 based on the exact body and your App Secret.
