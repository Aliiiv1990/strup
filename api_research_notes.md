# WhatsApp Cloud API Research Notes

## 1. Group Messaging Capabilities

Based on a review of the WhatsApp Cloud API documentation ([Send Messages Guide](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages) and [API Reference](https://developers.facebook.com/docs/whatsapp/cloud-api/reference)), the following observations are made regarding group messaging:

*   **Primary Focus on Individual Messaging:** The standard `/messages` endpoint is designed for sending messages to individual WhatsApp user IDs. The `recipient_type` parameter is typically set to `"individual"`.
*   **No Direct API for Sending to Existing Group IDs:** There is no clear, documented method within the Cloud API to send a message directly to an existing WhatsApp group using a group ID in the `to` field of the `/messages` endpoint in the same way one would send to an individual.
*   **No API for Group Creation/Management:** The Cloud API reference does not list any endpoints for creating new WhatsApp groups, adding/removing members from groups, or managing group settings programmatically. These actions are typically performed within the WhatsApp application itself by users.
*   **Broken Link for Group Messaging Guide:** An attempt to access a potential guide URL (`.../send-messages-to-groups`) resulted in a broken link, suggesting the feature might have been deprecated or the documentation moved/removed.

**Conclusion on Group Messaging:**
The WhatsApp Cloud API, in its current documented form, does **not** appear to directly support sending messages to pre-existing WhatsApp groups as a standard feature, nor does it support programmatic group creation or management. The API is primarily designed for business-to-consumer communication with individual users.

For the `ScheduledMessage` model's `target_whatsapp_id_or_group_id` and `is_group_message` fields:
*   If sending to groups is a hard requirement, this might involve workarounds outside the standard Cloud API usage, potentially using user-level automation (which is not recommended and often against terms of service) or if Meta introduces specific APIs for this in the future.
*   Given current API limitations, the application should likely focus on messaging individual contacts. If "group" messaging is interpreted as sending the same message to multiple *individual* contacts (e.g., members of a `ContactList`), this is feasible by iterating through the list and sending individual messages.
*   The `is_group_message` field might be useful for future-proofing or for scenarios where a "group" is an internal concept within the application, but the actual sending mechanism would still be individual messages to its members.

## 2. Programmatic WhatsApp Status Updates

Based on a review of the available WhatsApp Cloud API documentation:

*   **No API Endpoints for Status Updates:** There are no documented API endpoints or methods that allow for the programmatic creation, updating, or deletion of WhatsApp Statuses (similar to Instagram Stories or Facebook Stories).
*   **API Focus:** The Cloud API is focused on conversational messaging between businesses and customers, including sending transactional and marketing messages, and managing customer interactions. Status updates are a more user-centric social feature.

**Conclusion on Status Updates:**
The WhatsApp Cloud API does **not** support programmatic creation or updating of WhatsApp Statuses.

**Alternative Approach for Users (as per original plan):**
If the user wishes to inform their audience about something akin to a "status," the recommended approach using the API would be:
1.  **Broadcast Messaging via Templates:** Create a pre-approved message template (e.g., for announcements, updates, or special offers).
2.  **Send to Contact Lists:** Use the application to send this template message to relevant `ContactList`s or individual `Contact`s.
This leverages the API's strengths for reaching multiple users with approved content, achieving a similar communication goal as a status update but through direct messaging. Users should be reminded of template guidelines and opt-in requirements.

This research should inform the design of features that rely on these capabilities.
The `ScheduledMessage` and `SentMessageLog` fields `is_group_message` should be interpreted carefully, likely meaning messages intended for a conceptual group but delivered individually.
