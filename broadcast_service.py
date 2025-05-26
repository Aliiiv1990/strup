import datetime
from sqlalchemy.orm import Session
from scheduler import MessageScheduler
from whatsapp_service import WhatsAppService
from database_models import ContactList, Contact, MessageContent, ScheduledMessage
from database_setup import get_db_session # For type hinting and potentially direct use

class BroadcastService:
    def __init__(self, 
                 scheduler: MessageScheduler, 
                 whatsapp_service: WhatsAppService,
                 db_session_factory): # Typically a function like get_db_session
        """
        Initializes the BroadcastService.

        Args:
            scheduler (MessageScheduler): An instance of MessageScheduler.
            whatsapp_service (WhatsAppService): An instance of WhatsAppService.
            db_session_factory (function): A function that returns a new SQLAlchemy session.
                                          Example: database_setup.get_db_session
        """
        self.scheduler = scheduler
        self.whatsapp_service = whatsapp_service
        self.get_db_session = db_session_factory
        print("BroadcastService initialized.")

    def schedule_broadcast(self, 
                           message_content_id: int, 
                           contact_list_id: int, 
                           scheduled_time: datetime.datetime, 
                           broadcast_level_personalization: dict = None) -> tuple[int, list[str]]:
        """
        Schedules a broadcast by creating individual ScheduledMessage entries for each contact in a list.

        Args:
            message_content_id (int): ID of the MessageContent to be sent.
            contact_list_id (int): ID of the ContactList to broadcast to.
            scheduled_time (datetime.datetime): The time at which the messages should be sent.
            broadcast_level_personalization (dict, optional): Placeholders applicable to the entire broadcast
                                                               (e.g., campaign info). These will be stored
                                                               in ScheduledMessage.personalization_data_json.

        Returns:
            tuple[int, list[str]]: (count_of_messages_scheduled, list_of_errors_encountered)
            
        Raises:
            ValueError: If message_content_id or contact_list_id are invalid or not found.
        """
        db = self.get_db_session()
        scheduled_count = 0
        errors = []

        try:
            contact_list = db.query(ContactList).filter(ContactList.id == contact_list_id).first()
            if not contact_list:
                raise ValueError(f"ContactList with id {contact_list_id} not found.")

            message_content = db.query(MessageContent).filter(MessageContent.id == message_content_id).first()
            if not message_content:
                raise ValueError(f"MessageContent with id {message_content_id} not found.")

            if not contact_list.contacts:
                errors.append(f"ContactList {contact_list.name} (ID: {contact_list_id}) has no contacts.")
                return 0, errors

            for contact in contact_list.contacts:
                if not contact.whatsapp_id:
                    errors.append(f"Contact {contact.name or contact.id} in list {contact_list.name} is missing a whatsapp_id.")
                    continue
                
                try:
                    # Use the scheduler associated with this BroadcastService instance
                    # which should already have a db session from its own initialization
                    # OR pass the current session if scheduler methods are designed to accept it
                    
                    # Re-instantiate scheduler with the current session if its methods don't take a session
                    # current_scheduler = MessageScheduler(db_session=db) # If scheduler methods need a session passed
                    
                    # For simplicity, assuming self.scheduler uses its own session from its __init__
                    # or we ensure its session is the same as the one used here.
                    # The design of MessageScheduler's session management is key here.
                    # If MessageScheduler is stateful with its session, this is fine.
                    # If MessageScheduler's methods expect a session, it needs to be passed.
                    # Given current MessageScheduler design, its methods use self.db.
                    # We need to ensure self.scheduler.db is the current session.
                    # The cleanest way is for BroadcastService to manage sessions for its operations
                    # and pass sessions to services if they are designed to be stateless regarding sessions.
                    
                    # Let's assume MessageScheduler is initialized with a session factory or a session
                    # that is compatible with this flow. For this example, we'll use the scheduler
                    # as initialized, trusting its session management.

                    self.scheduler.db = db # Ensure scheduler uses the same session for this transaction
                                           # This is a bit of a hack; better to pass session to methods
                                           # or have scheduler manage its session per call via factory.

                    scheduled_msg = self.scheduler.add_scheduled_message(
                        message_content_id=message_content_id,
                        target_whatsapp_id=contact.whatsapp_id,
                        scheduled_time=scheduled_time,
                        is_group_message=False, # Each is an individual message
                        # personalization_data_json will be used at send time from ScheduledMessage
                    )
                    # Store broadcast-level personalization data with each scheduled message
                    if broadcast_level_personalization and scheduled_msg:
                        scheduled_msg.personalization_data_json = broadcast_level_personalization
                        db.add(scheduled_msg) # Add again to mark for update if session is different

                    scheduled_count += 1
                except Exception as e_sched:
                    db.rollback() # Rollback individual scheduling error
                    errors.append(f"Error scheduling for contact {contact.whatsapp_id}: {str(e_sched)}")
                    # Decide if we need to re-initialize session for scheduler or continue
                    # For now, assume subsequent calls to add_scheduled_message can proceed
            
            if errors and scheduled_count > 0: # Partial success
                db.commit() # Commit successfully scheduled messages
            elif scheduled_count > 0: # Full success
                db.commit()
            else: # No messages scheduled, possibly due to errors or empty list
                db.rollback() # Rollback if nothing was committed

        except ValueError as ve:
            db.rollback()
            raise ve # Re-raise specific ValueErrors
        except Exception as e:
            db.rollback()
            errors.append(f"An unexpected error occurred during schedule_broadcast: {str(e)}")
            # Potentially re-raise or handle more gracefully
            print(f"Unexpected error in schedule_broadcast: {e}") # Logging
        finally:
            db.close()

        if errors:
            print(f"schedule_broadcast completed with {scheduled_count} messages scheduled and errors: {errors}")
        else:
            print(f"schedule_broadcast completed successfully: {scheduled_count} messages scheduled.")
            
        return scheduled_count, errors

    def _render_message(self, template_body: str, contact: Contact, broadcast_personalization: dict = None) -> str:
        """
        Personalizes a message template with contact details and broadcast-level data.
        """
        personalized_message = template_body

        # 1. Contact-specific personalization
        personalized_message = personalized_message.replace("{{name}}", contact.name or "")
        personalized_message = personalized_message.replace("{{whatsapp_id}}", contact.whatsapp_id or "")

        if contact.custom_fields_json:
            for key, value in contact.custom_fields_json.items():
                placeholder = f"{{{{custom_{key}}}}}" # e.g., {{custom_city}}
                personalized_message = personalized_message.replace(placeholder, str(value) or "")

        # 2. Broadcast-level personalization (from ScheduledMessage.personalization_data_json)
        if broadcast_personalization:
            for key, value in broadcast_personalization.items():
                placeholder = f"{{{{broadcast_{key}}}}}" # e.g., {{broadcast_campaign_name}}
                personalized_message = personalized_message.replace(placeholder, str(value) or "")
        
        # Fallback for any unreplaced placeholders (optional, could remove them or leave as is)
        # import re
        # personalized_message = re.sub(r"\{\{[^}]+\}\}", "", personalized_message) # Remove unreplaced placeholders
        
        return personalized_message

    def process_pending_broadcasts(self):
        """
        Processes pending scheduled messages, personalizes them, and sends them.
        This method would be called periodically by an external task runner.
        """
        db = self.get_db_session()
        # Ensure services use this session or a compatible one
        self.scheduler.db = db 
        self.whatsapp_service.db = db

        processed_count = 0
        error_count = 0
        
        try:
            # Fetch messages that are due and marked 'pending'
            # These messages are already targeted to individual WhatsApp IDs by schedule_broadcast
            pending_messages = self.scheduler.get_pending_messages(limit=100) # Process in batches

            if not pending_messages:
                print("No pending broadcast messages to process.")
                return

            for scheduled_msg in pending_messages:
                try:
                    self.scheduler.update_message_status(scheduled_msg.id, "processing")
                    db.commit() # Commit status change before attempting send

                    message_content = db.query(MessageContent).filter(MessageContent.id == scheduled_msg.message_content_id).first()
                    contact = db.query(Contact).filter(Contact.whatsapp_id == scheduled_msg.target_whatsapp_id).first()

                    if not message_content:
                        self.scheduler.update_message_status(scheduled_msg.id, "failed", "MessageContent not found")
                        db.commit()
                        error_count +=1
                        continue
                    
                    if not contact:
                        # This case should ideally not happen if schedule_broadcast ensures contact validity
                        self.scheduler.update_message_status(scheduled_msg.id, "failed", f"Contact with WhatsApp ID {scheduled_msg.target_whatsapp_id} not found")
                        db.commit()
                        error_count +=1
                        continue

                    # Perform personalization
                    personalized_body = self._render_message(
                        template_body=message_content.body_text,
                        contact=contact,
                        broadcast_personalization=scheduled_msg.personalization_data_json
                    )
                    
                    # Send the message using WhatsAppService
                    # Assuming send_text_message is appropriate. If templates are used, logic would adapt.
                    success, api_msg_id, log_entry = self.whatsapp_service.send_text_message(
                        recipient_whatsapp_id=scheduled_msg.target_whatsapp_id,
                        message_body=personalized_body,
                        scheduled_message_id=scheduled_msg.id # Link log entry to the schedule
                    )

                    if success:
                        self.scheduler.update_message_status(scheduled_msg.id, "sent")
                        if log_entry: # Update log with actual API message ID if not already there
                            log_entry.whatsapp_message_id_from_api = api_msg_id
                            log_entry.status_from_webhook = "api_sent" # Confirm initial status
                            db.add(log_entry)
                        processed_count += 1
                    else:
                        self.scheduler.update_message_status(scheduled_msg.id, "failed", log_entry.error_message_if_any if log_entry else "Send failed")
                        error_count += 1
                    
                    db.commit() # Commit result of this message processing

                except Exception as e_proc:
                    db.rollback()
                    error_count += 1
                    print(f"Error processing scheduled message ID {scheduled_msg.id}: {e_proc}")
                    try:
                        # Try to mark as failed even if another error occurred
                        self.scheduler.update_message_status(scheduled_msg.id, "failed", f"Processing error: {str(e_proc)[:250]}")
                        db.commit()
                    except Exception as e_fail_update:
                        db.rollback()
                        print(f"Critical: Failed to update status for message {scheduled_msg.id} after error: {e_fail_update}")
        
        except Exception as e_outer:
            db.rollback() # Rollback any uncommitted changes from the loop
            print(f"An error occurred in the main process_pending_broadcasts loop: {e_outer}")
        finally:
            db.close()
            print(f"process_pending_broadcasts finished. Processed: {processed_count}, Errors: {error_count}")


if __name__ == '__main__':
    from database_setup import init_db
    from database_models import Base # For table creation
    
    # --- Setup ---
    engine = init_db() # Default SQLite
    # Base.metadata.create_all(engine) # Ensure tables are created - init_db should do this

    # Create a session for setup
    setup_db = get_db_session()

    # Create dummy data for testing
    # 1. MessageContent
    content1 = setup_db.query(MessageContent).filter(MessageContent.name == "Welcome Broadcast").first()
    if not content1:
        content1 = MessageContent(name="Welcome Broadcast", body_text="Hello {{name}}! Welcome to our service. Your WhatsApp ID is {{whatsapp_id}}. This is campaign {{broadcast_campaign_code}}.")
        setup_db.add(content1)
    
    content2 = setup_db.query(MessageContent).filter(MessageContent.name == "Custom Field Test").first()
    if not content2:
        content2 = MessageContent(name="Custom Field Test", body_text="Hi {{name}}, your order {{custom_order_id}} is ready. City: {{custom_city}}.")
        setup_db.add(content2)

    # 2. ContactList and Contacts
    list1 = setup_db.query(ContactList).filter(ContactList.name == "Test Broadcast List").first()
    if not list1:
        list1 = ContactList(name="Test Broadcast List")
        setup_db.add(list1)
        setup_db.commit() # Commit list to get ID

        contact1 = Contact(name="Alice Wonderland", whatsapp_id="111000111", custom_fields_json={"city": "Curiousville", "order_id": "A123"})
        contact2 = Contact(name="Bob The Builder", whatsapp_id="222000222", custom_fields_json={"city": "Constructicon", "title": "Mr."})
        contact3 = Contact(name="Charlie Chaplin", whatsapp_id="333000333") # No custom fields
        
        setup_db.add_all([contact1, contact2, contact3])
        list1.contacts.extend([contact1, contact2, contact3])
        setup_db.add(list1)

    setup_db.commit()
    setup_db.close()
    print("--- Test Data Setup Complete ---")

    # --- Initialize Services ---
    # Services will get their own sessions via the factory get_db_session
    
    # Need to pass the db_session_factory to BroadcastService
    # MessageScheduler and WhatsAppService in this example will be initialized
    # by BroadcastService or need to be passed initialized.
    # For this test, let's initialize them here and pass them.
    
    temp_db_for_scheduler = get_db_session()
    test_scheduler = MessageScheduler(db_session=temp_db_for_scheduler)
    
    temp_db_for_whatsapp = get_db_session()
    # Ensure WHATSAPP_API_TOKEN and WHATSAPP_PHONE_NUMBER_ID are set in env or use dummy values
    os.environ.setdefault("WHATSAPP_API_TOKEN", "dummy_broadcast_token")
    os.environ.setdefault("WHATSAPP_PHONE_NUMBER_ID", "dummy_broadcast_phone_id")
    test_whatsapp_service = WhatsAppService(db_session=temp_db_for_whatsapp)


    broadcast_service = BroadcastService(
        scheduler=test_scheduler,
        whatsapp_service=test_whatsapp_service,
        db_session_factory=get_db_session # Pass the factory function
    )

    # --- Test schedule_broadcast ---
    print("\n--- Testing schedule_broadcast ---")
    campaign_placeholders = {"campaign_code": "WELCOME2024"}
    try:
        count, errors = broadcast_service.schedule_broadcast(
            message_content_id=content1.id,
            contact_list_id=list1.id,
            scheduled_time=datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=1), # Schedule in past to be picked up
            broadcast_level_personalization=campaign_placeholders
        )
        print(f"Scheduled {count} messages for broadcast. Errors: {errors}")

        # Schedule another one for custom field testing
        count_custom, errors_custom = broadcast_service.schedule_broadcast(
            message_content_id=content2.id,
            contact_list_id=list1.id, # Using same list
            scheduled_time=datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=1), # Schedule in past
        )
        print(f"Scheduled {count_custom} custom field messages. Errors: {errors_custom}")


    except ValueError as e:
        print(f"Error during scheduling: {e}")

    # --- Test process_pending_broadcasts ---
    # This will pick up the messages scheduled above because their time is in the past.
    print("\n--- Testing process_pending_broadcasts ---")
    broadcast_service.process_pending_broadcasts()

    print("\n--- Broadcast Service Example Finished ---")

    # Clean up sessions used for initializing services if necessary
    temp_db_for_scheduler.close()
    temp_db_for_whatsapp.close()
