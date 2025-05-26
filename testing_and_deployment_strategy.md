# WhatsApp Platform: Testing and Deployment Strategy

This document outlines the proposed testing methodologies and a conceptual deployment strategy for the WhatsApp Platform application.

## 1. Testing Strategy

A comprehensive testing strategy is crucial to ensure the reliability, correctness, and robustness of the platform. This involves multiple layers of testing:

### Unit Tests

*   **Purpose:** To test individual functions, methods, and classes in isolation to verify that they work as expected. This helps catch bugs early and simplifies debugging.
*   **Key Modules/Components for Unit Testing:**
    *   **`scheduler.py`:** Logic for adding, retrieving, updating, and deleting scheduled messages (e.g., ensuring `get_pending_messages` correctly filters by time and status).
    *   **`analytics_service.py`:** Calculations for message counts, keyword extraction logic (testing the simulated preprocessing and frequency counting), and sentiment overview aggregation.
    *   **`chatbot_service.py`:** Rule matching logic, intent recognition simulation, and response selection (including random choice for varied responses).
    *   **`broadcast_service.py`:** Logic for scheduling broadcasts (ensuring individual messages are created for each contact) and the personalization logic in `_render_message`.
    *   **`database_models.py`:** While models themselves are often simple data structures, any custom methods or validation logic within them could be unit tested.
    *   Utility functions or helper classes used across the application.
*   **Frameworks:** Python's built-in `unittest` library or the `pytest` framework are recommended. `pytest` is often favored for its conciseness and powerful features.
*   **Mocking:** External dependencies should be mocked to ensure tests are isolated and fast. This includes:
    *   Database sessions/connections: When testing service logic that interacts with the database, the database calls should be mocked to avoid reliance on a live DB.
    *   External API calls: Specifically, calls to the `PyWa` client within `WhatsAppService` should be mocked to simulate various API responses (success, failure, different message IDs).
    *   `datetime.datetime.now()`: Often needs to be patched to control time in tests, especially for scheduling logic.

### Integration Tests

*   **Purpose:** To test the interactions between different components or services to ensure they work together correctly. This helps identify issues at the interfaces of modules.
*   **Key Integration Points:**
    *   **`BroadcastService` with `Scheduler` and `WhatsAppService`:**
        *   Verify that calling `BroadcastService.schedule_broadcast` correctly creates `ScheduledMessage` entries via `Scheduler`.
        *   Verify that `BroadcastService.process_pending_broadcasts` correctly fetches messages using `Scheduler`, personalizes them, and attempts to send them via `WhatsAppService` (with `WhatsAppService` calls mocked for this specific integration test, or using a test WhatsApp API if feasible).
    *   **`WebhookHandler` with `Database` and `ChatbotService`:**
        *   Test the full flow from receiving a mock webhook POST request to:
            *   Contact creation/update in the database.
            *   `ReceivedMessageLog` creation.
            *   Correct invocation of `ChatbotService.process_message`.
            *   (If ChatbotService responds) Ensure `WhatsAppService` is called by `ChatbotService` to send the reply (again, `WhatsAppService`'s actual send can be mocked).
    *   **Database Interactions:** Test service methods that perform complex queries or transactions against a real test database (e.g., a dedicated SQLite file or a separate PostgreSQL test database). This ensures SQL queries are correct and ORM mappings work as expected.

### API Interaction Testing (Mocked & Actual)

*   **Mocked Client Testing:**
    *   The `WhatsAppService` should be thoroughly tested with a mocked `PyWa` client (as is currently done in its `if __name__ == '__main__':` block). This allows simulating various scenarios like successful message sending, API errors, different response codes, etc., without making actual API calls.
*   **Actual API Testing (Staging/Test Environment):**
    *   Once actual WhatsApp Cloud API credentials and a test phone number are available, a limited set of tests should be performed against the live API.
    *   This would initially be manual or semi-automated (e.g., sending a message via a script and verifying its receipt on a test WhatsApp account, or receiving a message and checking logs).
    *   Focus on verifying authentication, basic message sending/receiving, and webhook registration.
    *   This is crucial for catching discrepancies between the mocked behavior and the real API behavior.

### Webhook Handler Testing

*   **Simulating WhatsApp API Calls:**
    *   Use tools like `curl`, Postman, or Python's `requests` library to send mock HTTP requests to the `/webhook` endpoint running locally or in a test environment.
    *   **GET Requests:** Test the webhook verification flow by sending requests with correct and incorrect `hub.verify_token` values.
    *   **POST Requests:**
        *   Craft valid JSON payloads mimicking actual WhatsApp message notifications.
        *   Test with various message types (text, media placeholders, etc.).
        *   Crucially, test the `X-Hub-Signature-256` validation by sending requests with valid and invalid signatures. (Requires calculating the HMAC-SHA256 hash of the request body using the App Secret).
*   **Verification:**
    *   Check for correct HTTP response codes (200, 400, 401, 403, 500).
    *   Verify that database entries (Contacts, `ReceivedMessageLog`) are created or updated as expected.
    *   Verify that the `ChatbotService` is invoked correctly.

### NLP Component Testing (Simulated & Actual)

*   **Simulated Functions:** The current `_simulate_hazm_preprocessing`, `_simulate_intent_recognition`, and `_simulate_sentiment_analysis` functions in `AnalyticsService` and `ChatbotService` can have basic unit tests to ensure their placeholder logic works as designed (e.g., keyword spotting, random choice).
*   **Actual NLP Integration:**
    *   If real NLP libraries (Hazm, DadmaTools, etc.) were integrated, they would require a more sophisticated testing strategy:
        *   **Preprocessing:** Test the actual preprocessing pipeline (e.g., Hazm normalization, tokenization, lemmatization) with sample Persian texts, including edge cases.
        *   **Model Accuracy:** For custom-trained models (intent recognition, sentiment analysis), testing would involve evaluating performance (e.g., precision, recall, F1-score) on a held-out test dataset.
        *   **Integration:** Ensure the data flow to and from these NLP components is correct.

## 2. Deployment Strategy

Deploying the Flask application requires several components to work together.

### Application Server

*   **WSGI Server:** The built-in Flask development server is not suitable for production. A production-grade WSGI (Web Server Gateway Interface) server is needed.
    *   **Recommended:** Gunicorn or uWSGI.
    *   These servers handle concurrent requests efficiently and provide better stability and performance.
    *   Example Gunicorn command: `gunicorn --workers 4 --bind 0.0.0.0:8000 webhook_handler:app` (assuming `app` is the Flask instance in `webhook_handler.py`).

### Database

*   **Production Database:** While SQLite is convenient for development, a more robust and scalable database is recommended for production.
    *   **Recommended:** PostgreSQL. MySQL is also a viable option.
    *   These offer better concurrency, data integrity features, and scalability.
    *   The application's database connection string (`SQLALCHEMY_DATABASE_URL` in `database_setup.py`) will need to be updated for the production database.

### Webhook Endpoint

*   **HTTPS and Public Accessibility:** The WhatsApp Cloud API requires the webhook endpoint to be served over HTTPS and be publicly accessible on the internet.
*   **Reverse Proxy:** A reverse proxy server is typically used in front of the WSGI application server.
    *   **Recommended:** Nginx or Caddy.
    *   **Responsibilities:**
        *   **HTTPS Termination:** Handle SSL/TLS certificates (e.g., from Let's Encrypt) and encrypt/decrypt traffic.
        *   **Load Balancing (if multiple app instances):** Distribute requests across application server workers or instances.
        *   **Serving Static Files (if any):** Can efficiently serve static assets.
        *   **Request Buffering/Rate Limiting:** Provide additional security and stability.
        *   Pass requests to the Gunicorn/uWSGI server.

### Environment Configuration

*   **Secrets Management:** Sensitive information like API tokens (`WHATSAPP_API_TOKEN`, `WHATSAPP_APP_SECRET`), database credentials (`SQLALCHEMY_DATABASE_URL`), and the Flask secret key must NOT be hardcoded in the application.
    *   **Method:** Use environment variables.
    *   **Secure Storage (Production):** For production environments, use a dedicated secrets management system:
        *   HashiCorp Vault
        *   AWS Secrets Manager
        *   Google Cloud Secret Manager
        *   Azure Key Vault
        *   Docker secrets (if using Docker Swarm or Kubernetes)
*   **Application Settings:** Other non-sensitive configurations can also be managed via environment variables for consistency.

### Task Scheduling/Background Jobs

*   The `BroadcastService.process_pending_broadcasts()` method (and potentially other future background tasks like state timeouts) needs to be run periodically.
*   **Options:**
    *   **Cron Jobs:** Simple to set up for basic periodic tasks. A cron job would execute a script that initializes the necessary services and calls the processing method.
        *   Example: `* * * * * /usr/bin/python /path/to/project/run_broadcast_processor.py`
    *   **Celery (Recommended for Scalability):** A powerful distributed task queue system.
        *   **Components:**
            *   **Celery Worker(s):** Processes that execute tasks.
            *   **Message Broker:** Manages the queue of tasks (e.g., RabbitMQ, Redis).
            *   **Celery Beat (Scheduler):** Schedules periodic tasks.
        *   Provides better scalability, reliability, retries, and monitoring for background tasks. This would involve defining Celery tasks for methods like `process_pending_broadcasts`.

### Containerization (Optional but Recommended)

*   **Docker:** Containerizing the application using Docker is highly recommended.
    *   **Benefits:**
        *   Encapsulates the application and all its dependencies (Python version, libraries) into a portable image.
        *   Ensures consistency between development, testing, and production environments.
        *   Simplifies deployment and scaling.
    *   A `Dockerfile` would define how to build the application image.
*   **Docker Compose:** Useful for managing multi-container setups locally (e.g., application container, PostgreSQL container, Redis container for Celery).

### Hosting Options (Brief Overview)

*   **Cloud Platforms:** Offer a wide range of services for hosting web applications, databases, and managing containers.
    *   **AWS:** EC2 (VMs), ECS/EKS (Containers), Elastic Beanstalk (PaaS), RDS (Managed Databases).
    *   **Google Cloud Platform (GCP):** Compute Engine (VMs), Kubernetes Engine (GKE), App Engine (PaaS), Cloud SQL (Managed Databases).
    *   **Microsoft Azure:** Virtual Machines, Azure Kubernetes Service (AKS), App Service (PaaS).
    *   **Heroku (PaaS):** Simplifies deployment but can be more expensive for larger applications.
    *   **DigitalOcean:** Droplets (VMs), App Platform (PaaS), Managed Databases.
*   **Self-hosting on a Virtual Private Server (VPS):** Requires more manual setup and maintenance but offers more control.

## 3. Logging and Monitoring (Brief Mention)

*   **Structured Logging:** Implement structured logging (e.g., JSON format) throughout the application. This makes logs easier to parse, search, and analyze, especially when using centralized logging systems (e.g., ELK stack, Splunk, Datadog). Python's `logging` module can be configured for this.
*   **Monitoring:** Basic monitoring of application health (uptime, error rates) and performance (response times, resource usage) is essential. Cloud platforms often provide built-in monitoring tools, or dedicated monitoring solutions can be integrated.

This strategy provides a roadmap for ensuring the quality and successful deployment of the WhatsApp Platform. The specific choices within each category will depend on the project's scale, budget, and team expertise.
