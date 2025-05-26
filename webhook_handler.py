import os
import json
import hmac
import hashlib
import datetime

from flask import Flask, request, abort, jsonify, current_app, render_template # Added render_template

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

# --- Dashboard Route ---
@app.route('/')
def dashboard_route(): # Renamed from dashboard to avoid conflict with potential future blueprint name
    mock_stats = {
        "total_contacts": 150,
        "scheduled_today": 10,
        "received_today": 25,
        "sent_today": 20 
    }
    # The dashboard.html created earlier uses Persian text.
    # The mock_stats keys should align with what's in dashboard.html (e.g., stats.total_contacts)
    return render_template('dashboard.html', stats=mock_stats)

# --- Contact Management Routes ---

# 1. List all contact lists
@app.route('/contacts')
def contact_lists_route():
    mock_data = [
        {'id': 1, 'name': 'مشتریان ویژه', 'contact_count': 50},
        {'id': 2, 'name': 'همکاران', 'contact_count': 15},
        {'id': 3, 'name': 'علاقه مندان به محصول الف', 'contact_count': 230}
    ]
    return render_template('contacts_management.html', contact_lists=mock_data)

# 2. Display form to create a new contact list
@app.route('/contacts/new-list-form')
def new_contact_list_form_route():
    # For editing, this route could take an optional list_id and pre-fill the form
    return render_template('contact_list_form.html', 
                           form_title="ایجاد لیست مخاطبین جدید", 
                           form_action_url=url_for('create_contact_list_route'), 
                           list=None) # No existing list data for new form

# 3. Handle creation of a new contact list (POST)
@app.route('/contacts/new-list', methods=['POST'])
def create_contact_list_route():
    # In a real app, process request.form['list_name'] and save to database
    list_name = request.form.get('list_name', 'لیست بدون نام')
    print(f"Simulating creation of contact list: {list_name}")
    # For now, just redirect back to the contact lists page
    # In a real app, add flash message for success/failure
    return redirect(url_for('contact_lists_route'))

# 4. View details of a specific contact list (contacts within it)
@app.route('/contacts/<int:list_id>')
def contact_list_detail_route(list_id):
    # Mock data - in a real app, query DB for list_id
    mock_list_name = f"لیست شماره {list_id}"
    mock_contacts = []
    if list_id == 1: # Example data for "مشتریان ویژه"
        mock_list_name = "مشتریان ویژه"
        mock_contacts = [
            {'id': 101, 'name': 'علی رضایی', 'whatsapp_id': '989120000001', 'custom_fields': {'شهر': 'تهران', 'علاقه': 'فناوری'}},
            {'id': 102, 'name': 'زهرا احمدی', 'whatsapp_id': '989120000002', 'custom_fields': {'شغل': 'پزشک'}},
        ]
    elif list_id == 2: # Example data for "همکاران"
        mock_list_name = "همکاران"
        mock_contacts = [
            {'id': 201, 'name': 'محمد کریمی', 'whatsapp_id': '989120000003', 'custom_fields': {'دپارتمان': 'فنی'}},
        ]
    else: # Generic fallback
        mock_contacts = [
            {'id': list_id * 100 + 1, 'name': f'مخاطب نمونه ۱ برای لیست {list_id}', 'whatsapp_id': f'989000000{list_id}01', 'custom_fields': {}},
            {'id': list_id * 100 + 2, 'name': f'مخاطب نمونه ۲ برای لیست {list_id}', 'whatsapp_id': f'989000000{list_id}02', 'custom_fields': {'نکته': 'تستی'}},
        ]
        
    return render_template('contact_list_detail.html', 
                           list_name=mock_list_name, 
                           contacts_in_list=mock_contacts,
                           list_id=list_id)

# 5. Display form to add a new contact to a specific list
@app.route('/contacts/<int:list_id>/new-contact-form')
def new_contact_form_route(list_id):
    # In a real app, you might fetch list_name here to display it
    mock_list_name = f"لیست شماره {list_id}" # Placeholder
    if list_id == 1: mock_list_name = "مشتریان ویژه"
    if list_id == 2: mock_list_name = "همکاران"
    
    return render_template('contact_form.html', 
                           form_title=f"افزودن مخاطب جدید به {mock_list_name}",
                           form_action_url=url_for('create_contact_route', list_id=list_id),
                           list_id=list_id,
                           list_name=mock_list_name,
                           contact=None) # No existing contact data for new form

# 6. Handle creation of a new contact within a list (POST)
@app.route('/contacts/<int:list_id>/new-contact', methods=['POST'])
def create_contact_route(list_id):
    # In a real app, process request.form data (name, whatsapp_id, custom_fields)
    # and save the new contact, associating it with list_id.
    contact_name = request.form.get('contact_name', 'مخاطب بی نام')
    whatsapp_id = request.form.get('whatsapp_id', 'شناسه نامشخص')
    custom_fields_str = request.form.get('custom_fields', '{}')
    print(f"Simulating adding contact '{contact_name}' ({whatsapp_id}) with fields '{custom_fields_str}' to list ID {list_id}.")
    # For now, redirect back to the contact list detail page
    return redirect(url_for('contact_list_detail_route', list_id=list_id))

# --- Broadcast Management Routes ---

# 1. List all broadcasts
@app.route('/broadcasts')
def broadcasts_route():
    mock_broadcasts = [
        {'id': 1, 'message_snippet': 'تخفیف ویژه بهاری! تا ۳۰٪ تخفیف...', 'target_lists': 'مشتریان ویژه, علاقه مندان به محصول الف', 'scheduled_time': '1403-01-15 10:00', 'status': 'ارسال شده'},
        {'id': 2, 'message_snippet': 'معرفی محصول جدید: دستیار هوشمند...', 'target_lists': 'همه مخاطبین', 'scheduled_time': '1403-01-20 14:30', 'status': 'در انتظار'},
        {'id': 3, 'message_snippet': 'یادآوری وبینار آموزشی فردا...', 'target_lists': 'ثبت نام کنندگان وبینار', 'scheduled_time': '1403-01-10 09:00', 'status': 'لغو شده'},
    ]
    return render_template('broadcasts_management.html', broadcasts_data=mock_broadcasts)

# 2. Display form to schedule a new broadcast
@app.route('/broadcasts/new')
def schedule_broadcast_form_route():
    mock_message_templates = [
        {'id': 'msg_template_1', 'name': 'قالب خوش آمدگویی', 'body_snippet': 'سلام {{name}} عزیز، به جمع ما خوش آمدید...'},
        {'id': 'msg_template_2', 'name': 'قالب پیشنهاد ویژه', 'body_snippet': 'یک پیشنهاد شگفت انگیز برای شما {{name}}...'},
        {'id': 'msg_template_3', 'name': 'قالب یادآوری رویداد', 'body_snippet': 'فراموش نکنید، رویداد ما فردا ساعت...'},
    ]
    mock_contact_lists = [ # Reusing similar structure from contact_lists_route for consistency
        {'id': 1, 'name': 'مشتریان ویژه', 'contact_count': 50},
        {'id': 2, 'name': 'همکاران', 'contact_count': 15},
        {'id': 3, 'name': 'علاقه مندان به محصول الف', 'contact_count': 230},
        {'id': 4, 'name': 'ثبت نام کنندگان وبینار', 'contact_count': 120},
        {'id': 5, 'name': 'همه مخاطبین', 'contact_count': 500},
    ]
    return render_template('schedule_broadcast_form.html', 
                           available_message_templates=mock_message_templates,
                           available_contact_lists=mock_contact_lists)

# 3. Handle scheduling of a new broadcast (POST)
@app.route('/broadcasts/create', methods=['POST'])
def create_broadcast_route():
    # In a real app, process request.form data and use BroadcastService to schedule
    broadcast_name = request.form.get('broadcast_name', 'ارسال گروهی بدون نام')
    message_content_id = request.form.get('message_content_id')
    contact_list_ids = request.form.getlist('contact_list_ids') # .getlist for multiple select
    scheduled_time_str = request.form.get('scheduled_time')
    personalization_placeholders = request.form.get('personalization_placeholders', '{}')
    
    print(f"Simulating scheduling of broadcast:")
    print(f"  Name: {broadcast_name}")
    print(f"  Message Content ID: {message_content_id}")
    print(f"  Target List IDs: {contact_list_ids}")
    print(f"  Scheduled Time: {scheduled_time_str}")
    print(f"  Personalization: {personalization_placeholders}")
    
    # For now, just redirect back to the broadcasts management page
    # In a real app, add flash message for success/failure
    return redirect(url_for('broadcasts_route'))

# --- Chatbot Rules Management Routes ---
MOCK_CHATBOT_RULES = [
    {'id': 1, 'name': 'Greeting Rule', 'keywords_str': 'سلام,وقت بخیر,روز بخیر', 'response_text': 'سلام! چطور میتونم کمکتون کنم؟ 😊', 'match_type': 'any'},
    {'id': 2, 'name': 'Thank You Rule', 'keywords_str': 'ممنون,متشکرم,مرسی', 'response_text': 'خواهش میکنم! خوشحالم که تونستم کمک کنم. 🙏', 'match_type': 'any'},
    {'id': 3, 'name': 'Product Inquiry', 'keywords_str': 'محصول,کالا,قیمت', 'response_text': 'برای اطلاعات بیشتر در مورد محصولات و قیمت‌ها، لطفا به وبسایت ما مراجعه کنید: example.com/products', 'match_type': 'any'},
    {'id': 4, 'name': 'Order Status Inquiry', 'keywords_str': 'سفارش,وضعیت,پیگیری', 'response_text': 'برای پیگیری وضعیت سفارش، لطفا شماره سفارش خود را وارد کنید.', 'match_type': 'any'},
]

@app.route('/chatbot-rules', methods=['GET'])
def chatbot_rules_route():
    edit_rule_id_str = request.args.get('edit_rule_id')
    editing_rule = None
    if edit_rule_id_str:
        try:
            edit_rule_id = int(edit_rule_id_str)
            editing_rule = next((rule for rule in MOCK_CHATBOT_RULES if rule['id'] == edit_rule_id), None)
        except ValueError:
            print(f"Warning: Invalid edit_rule_id '{edit_rule_id_str}' received.")
            # Optionally add a flash message here for the user

    return render_template('chatbot_rules.html', 
                           chatbot_rules_data=MOCK_CHATBOT_RULES,
                           editing_rule=editing_rule)

@app.route('/chatbot-rules/save', methods=['POST'])
def save_chatbot_rule_route():
    rule_id_str = request.form.get('rule_id')
    rule_name = request.form.get('rule_name')
    keywords_str = request.form.get('keywords')
    response_text = request.form.get('response_text')
    match_type = request.form.get('match_type')

    if rule_id_str: # Editing existing rule
        try:
            rule_id = int(rule_id_str)
            # In a real app, find and update the rule in the database
            rule_to_update = next((rule for rule in MOCK_CHATBOT_RULES if rule['id'] == rule_id), None)
            if rule_to_update:
                print(f"Simulating update of chatbot rule ID {rule_id}:")
                rule_to_update['name'] = rule_name
                rule_to_update['keywords_str'] = keywords_str
                rule_to_update['response_text'] = response_text
                rule_to_update['match_type'] = match_type
            else:
                print(f"Error: Rule ID {rule_id} not found for update.")
        except ValueError:
            print(f"Error: Invalid Rule ID '{rule_id_str}' for update.")
    else: # Adding new rule
        # In a real app, create a new rule in the database
        new_rule_id = max(rule['id'] for rule in MOCK_CHATBOT_RULES) + 1 if MOCK_CHATBOT_RULES else 1
        new_rule = {
            'id': new_rule_id,
            'name': rule_name,
            'keywords_str': keywords_str,
            'response_text': response_text,
            'match_type': match_type
        }
        MOCK_CHATBOT_RULES.append(new_rule) # Add to mock list
        print(f"Simulating creation of new chatbot rule:")
    
    print(f"  Rule Name: {rule_name}")
    print(f"  Keywords: {keywords_str}")
    print(f"  Response Text: {response_text}")
    print(f"  Match Type: {match_type}")
    
    # In a real app, add flash message for success/failure
    return redirect(url_for('chatbot_rules_route'))

# --- Analytics Route ---
@app.route('/analytics', methods=['GET'])
def analytics_route():
    start_date_str = request.args.get('start_date')
    end_date_str = request.args.get('end_date')

    # Simulate data fetching based on dates (or always return same mock data for now)
    # In a real app, you'd parse dates, call AnalyticsService methods, and handle potential errors.
    mock_analytics_data = {
        "message_counts": {"sent": 120, "received": 180, "total": 300},
        "common_keywords": [("تخفیف", 25), ("محصول", 20), ("جدید", 15), ("سلام", 30), ("قیمت", 18)],
        "sentiment_overview": {"positive": 90, "negative": 30, "neutral": 60}
    }

    date_filter_applied_message = ""
    if start_date_str and end_date_str:
        # Simulate slight change if dates are provided, to show the filter is "acknowledged"
        mock_analytics_data["message_counts"]["sent"] = 105
        mock_analytics_data["message_counts"]["received"] = 165
        mock_analytics_data["message_counts"]["total"] = 270
        mock_analytics_data["common_keywords"] = [("پیشنهاد", 22), ("سفارش", 18), ("ویژه", 12)]
        mock_analytics_data["sentiment_overview"]["positive"] = 80
        date_filter_applied_message = f" (فیلتر شده از {start_date_str} تا {end_date_str})"
    
    # Add the message to the data passed to template if needed, or just use it for server log
    print(f"Analytics data requested{date_filter_applied_message}")

    return render_template('analytics.html', 
                           analytics_data=mock_analytics_data, 
                           request_args=request.args)


# --- Test UI Route ---
@app.route('/ui-test')
def ui_test():
    # This route is for testing if Flask can serve HTML templates.
    # It uses the test_page.html created in the templates folder.
    return render_template('test_page.html', message="Flask templates are working!")

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
