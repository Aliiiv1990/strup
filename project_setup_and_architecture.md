# WhatsApp Platform Project: Setup and Architecture

## 1. External Setup Guide (for the User)

### Summary of Meta Setup Steps:
Users need to navigate the Meta ecosystem to prepare for integrating with the WhatsApp Cloud API. This involves the following key stages:

1.  **Create/Utilize a Meta Business Portfolio (formerly Meta Business Manager):**
    *   This is the central hub for managing business assets on Meta, including WhatsApp accounts.
    *   If the user doesn't have one, they'll need to create one at [business.meta.com](https://business.meta.com/).
2.  **Create a WhatsApp Business Account (WABA):**
    *   Within the Meta Business Portfolio, create a WABA. This account will be linked to your business.
3.  **Register/Connect a Phone Number:**
    *   A dedicated phone number is required. This number must not be actively used with another WhatsApp account (personal or business app).
    *   During setup, Meta will guide the user through registering this number and verifying it via an SMS or phone call.
    *   The user will need to choose a display name for the WhatsApp business profile, which will be reviewed by Meta.

### Key Information and Decisions:

*   **Business Verification:** Meta requires businesses to be verified to access certain WhatsApp Business Platform features and to scale messaging. This process can take time and typically involves submitting official business documents. It's crucial to start this early.
*   **Phone Number Choice:**
    *   The number must be able to receive an international SMS or voice call for verification.
    *   It cannot be a short code.
    *   Once registered with the API, it cannot be easily moved back to the regular WhatsApp Business App or personal WhatsApp app.
*   **Display Name:** This name will be shown to users. It should accurately represent the business and adhere to Meta's commerce and business policies. It undergoes a review process.
*   **Two-Factor Authentication:** Secure the Meta Business Portfolio and WhatsApp Business Account with two-factor authentication.

### Relevant Meta Documentation:

*   **Get Started with WhatsApp Cloud API:** This is the primary guide and starting point.
    *   [https://developers.facebook.com/docs/whatsapp/cloud-api/get-started](https://developers.facebook.com/docs/whatsapp/cloud-api/get-started)
*   **About Meta Business Portfolio:**
    *   [https://www.facebook.com/business/help/1710077379209564](https://www.facebook.com/business/help/1710077379209564)
*   **Verify Your Business in Meta Business Portfolio:**
    *   [https://www.facebook.com/business/help/2058515294227817](https://www.facebook.com/business/help/2058515294227817)
*   **Add a Phone Number to your WhatsApp Business Account:**
    *   [https://developers.facebook.com/docs/whatsapp/cloud-api/get-started/add-a-phone-number](https://developers.facebook.com/docs/whatsapp/cloud-api/get-started/add-a-phone-number)
*   **WhatsApp Business Display Name:**
    *   [https://developers.facebook.com/docs/whatsapp/cloud-api/guides/display-name](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/display-name)

## 2. Server-Side Application Architecture

### Technology Stack:

*   **Language:** Python (Version 3.9+)
*   **Framework:** Flask
*   **Justification:**
    *   **Ecosystem & Libraries:** Python has a vast ecosystem of libraries, including excellent support for HTTP requests (e.g., `requests` library, which `PyWa` likely uses under the hood), database interaction (e.g., SQLAlchemy), and general web development.
    *   **Developer Familiarity:** Python is a widely known language, making it easier for developers to contribute and maintain the project.
    *   **Suitability for API Interaction and Webhooks:** Flask is a lightweight and flexible micro-framework, well-suited for building API-centric applications and handling webhook requests efficiently. It's less opinionated than Django, which is beneficial for this type of focused application.
    *   **Scalability:** While Flask is a micro-framework, it can be scaled effectively with tools like Gunicorn (for WSGI) and appropriate infrastructure.

### Main Components:

1.  **Webhook Handler (`webhook_handler.py`):**
    *   Receives incoming HTTPS POST requests from Meta (WhatsApp).
    *   Validates the Meta signature to ensure authenticity.
    *   Parses the incoming JSON payload (message content, status updates, etc.).
    *   Queues messages or events for asynchronous processing by the Chatbot Engine or other relevant services. This prevents blocking the webhook response.
    *   Responds quickly to Meta with a `200 OK` status.

2.  **WhatsApp API Client (`whatsapp_client.py`):**
    *   Manages all outgoing communication with the WhatsApp Cloud API.
    *   Uses the `PyWa` SDK (recommended, see section 4) or direct HTTP calls.
    *   Handles sending messages (text, media, templates), marking messages as read, etc.
    *   Manages API tokens (retrieval, secure storage, refreshing).
    *   Includes error handling and retry mechanisms for API calls.

3.  **Chatbot Engine / Business Logic (`chatbot_engine.py`):**
    *   Processes the messages received via the webhook.
    *   Implements the core logic of the chatbot: understanding user intent, generating responses, and interacting with other services.
    *   May involve Natural Language Processing (NLP) components (potentially external or simpler rule-based logic).
    *   Manages conversation state if necessary.

4.  **Database Interface (`database.py` / `models.py`):**
    *   Interacts with a database (e.g., PostgreSQL, SQLite for simpler setups) to store:
        *   User conversation history.
        *   User profiles or preferences.
        *   Application configuration.
        *   Analytics data.
    *   Likely uses an ORM like SQLAlchemy for easier database operations and schema management.

5.  **Scheduling Service (`scheduler.py`):**
    *   Manages scheduled tasks, such as:
        *   Sending follow-up messages.
        *   Running periodic reports or data synchronization.
        *   Checking for API token expiry.
    *   Could use libraries like APScheduler or Celery (for more complex, distributed task queuing).

6.  **Analytics Engine (`analytics.py`):**
    *   Collects data on message volume, user engagement, error rates, etc.
    *   Stores this data in the database or sends it to an external analytics platform.
    *   Provides insights into the chatbot's performance and user interactions.

7.  **Configuration Management (`config.py`):**
    *   Manages application settings, including API keys, database credentials, webhook verification tokens, etc.
    *   Loads configuration from environment variables or configuration files.
    *   Ensures sensitive information is not hardcoded.

### Basic Directory Structure:

```
whatsapp_project/
├── app/
│   ├── __init__.py
│   ├── main.py             # Flask app initialization, routes
│   ├── webhook_handler.py  # Handles incoming WhatsApp webhooks
│   ├── whatsapp_client.py  # Manages communication with WhatsApp API
│   ├── chatbot_engine.py   # Core chatbot logic
│   ├── models.py           # Database models (e.g., SQLAlchemy)
│   ├── database.py         # Database connection and session management
│   ├── scheduler.py        # Task scheduling (if needed)
│   ├── analytics.py        # Analytics functions
│   ├── services/           # For other business logic services
│   │   └── __init__.py
│   ├── templates/          # If serving any HTML pages (e.g., for status)
│   │   └── index.html
│   └── static/             # Static files (CSS, JS)
├── tests/                  # Unit and integration tests
│   ├── __init__.py
│   ├── test_webhook_handler.py
│   ├── test_whatsapp_client.py
│   └── ...
├── venv/                   # Virtual environment
├── config.py               # Application configuration
├── requirements.txt        # Python dependencies
├── .env_example            # Example environment variables
├── Dockerfile              # For containerization
├── docker-compose.yml      # For local development setup
└── project_setup_and_architecture.md # This document
```

## 3. Webhook Endpoint Setup Plan

The webhook endpoint is critical for receiving real-time updates from the WhatsApp Cloud API, such as incoming messages and message status changes.

### Requirements:

1.  **HTTPS:** The endpoint URL **must** be HTTPS. Meta will not send data to non-secure (HTTP) URLs. This means an SSL/TLS certificate is required for the server hosting the webhook.
    *   For development, tools like `ngrok` can provide a temporary HTTPS tunnel to a local development server.
    *   For production, a proper SSL certificate (e.g., from Let's Encrypt or a commercial CA) must be configured on the web server.
2.  **Publicly Accessible:** The endpoint must be reachable from Meta's servers on the public internet.
3.  **Stable URL:** The URL should be stable. Frequent changes will require reconfiguration in the Meta App Dashboard.

### Initial Data Processing:

1.  **Webhook Registration and Verification (GET Request):**
    *   When configuring the webhook URL in the Meta App Dashboard, Meta will send a GET request to the endpoint.
    *   This request will include query parameters: `hub.mode`, `hub.challenge`, and `hub.verify_token`.
    *   The endpoint must:
        *   Verify that `hub.mode` is `subscribe`.
        *   Verify that `hub.verify_token` matches the secret token defined by the developer in the Meta App Dashboard.
        *   If both are valid, respond with the `hub.challenge` value in the response body and a `200 OK` status.
        *   If verification fails, respond with a `403 Forbidden` status.
    *   Our Flask application will have a route (e.g., `/webhook`) that handles this GET request.

2.  **Receiving Notifications (POST Request):**
    *   Once verified, Meta will send POST requests to this endpoint with event notifications in a JSON payload.
    *   The endpoint must:
        *   **Quickly acknowledge receipt:** Respond with a `200 OK` status as soon as possible. Meta has timeouts, and failing to respond quickly can lead to the webhook being disabled.
        *   **Signature Validation:** Before processing the payload, validate the `X-Hub-Signature-256` header. This signature is a SHA256 hash of the request body, using your App Secret as the key. This ensures the request genuinely originated from Meta and was not tampered with.
        *   **Parse JSON Payload:** The request body contains a JSON object detailing the event (e.g., new message, message status update).
        *   **Asynchronous Processing:** To ensure a fast response, the actual processing of the event (e.g., interpreting the message, generating a reply, updating a database) should be handed off to an asynchronous task queue (e.g., Celery, RQ, or even a simple thread pool for lighter loads). The webhook handler itself should do minimal work.

### Security Considerations:

*   **HTTPS Enforcement:** Already a requirement by Meta.
*   **Webhook Verification Token:** Use a strong, unique secret token for the `hub.verify_token` step. This token should be stored securely as an environment variable, not hardcoded.
*   **Signature Validation (`X-Hub-Signature-256`):** This is crucial.
    *   The App Secret (used for hashing) must be kept confidential and stored securely as an environment variable.
    *   The comparison of the calculated hash and the provided signature must be done using a constant-time comparison function to prevent timing attacks.
*   **Input Validation:** Although the primary validation is the signature, always treat incoming data with caution. Validate data types and structure if further processing relies on specific formats.
*   **Rate Limiting (Optional but Recommended):** Implement rate limiting on the endpoint to protect against potential denial-of-service (DoS) attacks or misbehaving clients (though less likely from Meta itself).
*   **Logging and Monitoring:** Log all webhook requests (headers and body for debugging, being mindful of sensitive PII data) and monitor for suspicious activity or high error rates.
*   **Error Handling:** Implement robust error handling. If processing fails after acknowledging the webhook, ensure these errors are logged and potentially retried without blocking new incoming webhooks.
*   **Idempotency:** Design downstream processing to be idempotent where possible. Meta may occasionally resend webhooks, and your system should handle duplicates gracefully.

### Example Flask Route Snippet (Conceptual):

```python
from flask import Flask, request, abort, jsonify
import hmac
import hashlib
import os

app = Flask(__name__)

# Load from environment variables
WEBHOOK_VERIFY_TOKEN = os.environ.get("WEBHOOK_VERIFY_TOKEN")
APP_SECRET = os.environ.get("APP_SECRET")

@app.route('/webhook', methods=['GET', 'POST'])
def webhook():
    if request.method == 'GET':
        # Webhook verification
        if request.args.get('hub.mode') == 'subscribe' and \
           request.args.get('hub.verify_token') == WEBHOOK_VERIFY_TOKEN:
            return request.args.get('hub.challenge'), 200
        else:
            abort(403)
    elif request.method == 'POST':
        # Signature validation
        signature = request.headers.get('X-Hub-Signature-256')
        if not signature:
            abort(400, "Signature missing")

        # Remove 'sha256=' prefix
        signature_hash = signature.split('=')[-1]
        
        expected_hash = hmac.new(
            APP_SECRET.encode('utf-8'),
            request.data,
            hashlib.sha256
        ).hexdigest()

        if not hmac.compare_digest(expected_hash, signature_hash):
            abort(400, "Invalid signature")

        # Process the payload (ideally asynchronously)
        payload = request.get_json()
        # print(f"Received payload: {payload}") 
        # TODO: Add to a task queue for processing by chatbot_engine.py

        return jsonify({'status': 'success'}), 200

if __name__ == '__main__':
    # For development only, use a proper WSGI server in production
    app.run(debug=True, port=5000) 
```
(Note: The above Python snippet is for illustration. The actual implementation will be part of `webhook_handler.py` as per the architecture.)

## 4. SDK vs. Direct API Calls Analysis

When interacting with the WhatsApp Cloud API using Python, developers have the choice of using an SDK like `PyWa` or making direct HTTP calls.

### Direct HTTP Calls to WhatsApp Cloud API

*   **Pros:**
    *   **Full Control:** Direct calls offer maximum control over the request and response handling. Every aspect of the API interaction (headers, timeouts, error parsing) can be customized.
    *   **No External Dependencies (beyond HTTP library):** Reduces the number of third-party libraries, potentially simplifying dependency management and reducing the attack surface.
    *   **Immediate Access to New Features:** As soon as Meta updates the API or adds new endpoints, they can be used directly without waiting for an SDK to be updated.
    *   **Understanding API Internals:** Forces a deeper understanding of the WhatsApp Cloud API's structure, authentication, and data formats.

*   **Cons:**
    *   **Increased Development Time:** Requires writing more boilerplate code for authentication, request formatting, response parsing, and error handling for each API endpoint.
    *   **Higher Complexity:** Managing API tokens, constructing correct request bodies, and handling various API responses (including errors) manually can be complex and error-prone.
    *   **Maintenance Overhead:** If Meta changes API versions or authentication mechanisms, the developer is responsible for updating all relevant parts of their code.
    *   **Potential for Errors:** More manual coding means a higher chance of introducing bugs related to API interaction.

### Using the `PyWa` Python SDK

`PyWa` is a Python wrapper for the WhatsApp Cloud API. (Official SDKs from Meta might also exist or be developed in the future).

*   **Pros:**
    *   **Ease of Development:** SDKs abstract away much of the low-level complexity of direct API calls. They provide convenient methods for common operations like sending messages, handling different message types, and processing incoming webhooks.
    *   **Reduced Boilerplate:** Significantly less code is needed to perform API actions, leading to faster development cycles.
    *   **Improved Readability:** Code using an SDK is often more concise and easier to understand.
    *   **Built-in Best Practices:** A well-maintained SDK often incorporates best practices for authentication, error handling, and API usage patterns.
    *   **Community Support (Potentially):** Popular SDKs usually have a community around them, providing support, examples, and bug fixes.
    *   **Webhook Parsing:** `PyWa` likely includes utilities to easily parse and validate incoming webhook data, which is a significant advantage.

*   **Cons:**
    *   **Dependency on SDK Maintainers:** If the SDK is not actively maintained, it might lag behind official API updates or contain unfixed bugs.
    *   **Abstraction Layer:** While helpful, the abstraction can sometimes make it harder to debug issues or perform highly custom API interactions not explicitly supported by the SDK.
    *   **Potential Overhead:** SDKs might introduce a small amount of performance overhead, though this is usually negligible for most applications.
    *   **Learning Curve:** Developers need to learn the SDK's specific methods and conventions.

### Recommendation:

**Use the `PyWa` Python SDK (or an official Meta-provided Python SDK if available and stable).**

For this project, the benefits of using an SDK like `PyWa` significantly outweigh the drawbacks, especially given the chosen Python/Flask stack.

*   **Ease of Development & Maintenance:** The primary drivers for this recommendation. An SDK will accelerate development by providing pre-built functions for sending various message types, handling media, and potentially parsing webhook notifications. Maintenance is also simplified, as the SDK maintainers are responsible for keeping up with API changes (assuming the SDK is well-maintained).
*   **Feature Coverage:** Good SDKs aim to cover the majority of the API's functionality. While there might be edge cases or very new features not immediately available, the core functionality required for a chatbot (sending/receiving messages, handling status updates) is typically well-supported.
*   **Error Handling and Reliability:** SDKs often include more robust error handling and retry mechanisms than what might be implemented from scratch in a tight timeframe.

Even if `PyWa` doesn't cover 100% of the API, it's often possible to make direct HTTP calls for specific, unsupported features while using the SDK for the bulk of interactions.

### `PyWa` Potential Installation and Dependencies:

If `PyWa` is chosen, the typical installation process would be:

1.  **Installation via pip:**
    ```bash
    pip install pywa
    ```
2.  **Dependencies:**
    *   `PyWa` itself will have dependencies, primarily an HTTP client library like `requests` or `httpx`.
    *   When `pip install pywa` is run, these dependencies will be automatically installed.
    *   It's important to add `pywa` (with a specific version or version range) to the `requirements.txt` file for the project to ensure consistent environments.

    Example `requirements.txt` entry:
    ```
    Flask>=2.0
    pywa>=1.0  # Or the latest stable version
    python-dotenv
    # other dependencies like SQLAlchemy, gunicorn, etc.
    ```

### Final Consideration:

Before fully committing, it's good practice to:
1.  Check the current status and maintenance level of `PyWa` (or any chosen SDK). Look at recent commit activity, open issues, and community feedback.
2.  Review its documentation to ensure it aligns with the project's needs and is easy to work with.
3.  Perform a small proof-of-concept with the SDK to send a message and receive a webhook to confirm its suitability.

If `PyWa` turns out to be unsuitable (e.g., unmaintained, missing critical features without workarounds), then falling back to direct API calls would be the alternative, with the understanding that this will increase development effort.
