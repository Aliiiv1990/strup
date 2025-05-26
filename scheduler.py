import datetime
from sqlalchemy.orm import Session
from database_models import ScheduledMessage, MessageContent, ContactList, Contact # Assuming models are accessible
from sqlalchemy import and_

class MessageScheduler:
    def __init__(self, db_session: Session):
        """
        Initializes the MessageScheduler with a database session.

        Args:
            db_session (Session): SQLAlchemy session for database operations.
        """
        self.db = db_session

    def add_scheduled_message(self, 
                              message_content_id: int, 
                              scheduled_time: datetime.datetime,
                              contact_list_id: int = None, 
                              target_whatsapp_id: str = None,
                              is_group_message: bool = False) -> ScheduledMessage | None:
        """
        Creates a new ScheduledMessage entry in the database.

        Args:
            message_content_id (int): ID of the MessageContent to be sent.
            scheduled_time (datetime.datetime): The time at which the message should be sent.
            contact_list_id (int, optional): ID of the ContactList for broadcasting.
                                            'is_group_message' should be True if this is used.
            target_whatsapp_id (str, optional): Specific WhatsApp ID for a direct message.
            is_group_message (bool, optional): If True and contact_list_id is provided, signifies a broadcast.
                                              If True and target_whatsapp_id is a group ID (future use), signifies group message.

        Returns:
            ScheduledMessage | None: The created ScheduledMessage object or None if inputs are invalid.
        
        Raises:
            ValueError: If input parameters are invalid (e.g., missing content_id, time, or target).
        """
        if not message_content_id or not scheduled_time:
            raise ValueError("message_content_id and scheduled_time are required.")

        if not contact_list_id and not target_whatsapp_id:
            raise ValueError("Either contact_list_id or target_whatsapp_id must be provided.")

        if contact_list_id and target_whatsapp_id:
            raise ValueError("Provide either contact_list_id for a list or target_whatsapp_id for a direct message, not both.")

        # Validate existence of foreign key entities if necessary (optional, DB will enforce)
        # content = self.db.query(MessageContent).filter(MessageContent.id == message_content_id).first()
        # if not content:
        #     raise ValueError(f"MessageContent with id {message_content_id} not found.")
        # if contact_list_id and not self.db.query(ContactList).filter(ContactList.id == contact_list_id).first():
        #     raise ValueError(f"ContactList with id {contact_list_id} not found.")
        # if target_whatsapp_id and not self.db.query(Contact).filter(Contact.whatsapp_id == target_whatsapp_id).first():
        #     # This check might be too strict if new contacts can be messaged directly
        #     # Consider how to handle contacts not yet in the DB
        #     pass


        new_scheduled_message = ScheduledMessage(
            message_content_id=message_content_id,
            scheduled_time=scheduled_time,
            contact_list_id=contact_list_id if is_group_message and contact_list_id else None,
            target_whatsapp_id=target_whatsapp_id if not (is_group_message and contact_list_id) else None,
            is_group_message=is_group_message, # True if sending to a list or a (future) group ID
            status='pending'
        )
        self.db.add(new_scheduled_message)
        try:
            self.db.commit()
            self.db.refresh(new_scheduled_message)
            return new_scheduled_message
        except Exception as e:
            self.db.rollback()
            # Log error e
            raise e


    def get_pending_messages(self, limit: int = 100) -> list[ScheduledMessage]:
        """
        Fetches ScheduledMessage entries that are due to be sent.
        (scheduled_time <= now and status is 'pending').

        Args:
            limit (int): Maximum number of messages to fetch.

        Returns:
            list[ScheduledMessage]: A list of pending ScheduledMessage objects.
        """
        now = datetime.datetime.now(datetime.timezone.utc) # Ensure timezone awareness if DB stores UTC
        # If scheduled_time in DB is naive, use datetime.datetime.now()
        
        pending_messages = (
            self.db.query(ScheduledMessage)
            .filter(ScheduledMessage.scheduled_time <= now, ScheduledMessage.status == 'pending')
            .order_by(ScheduledMessage.scheduled_time)
            .limit(limit)
            .all()
        )
        return pending_messages

    def update_message_status(self, 
                              scheduled_message_id: int, 
                              status: str, 
                              error_message: str = None) -> ScheduledMessage | None:
        """
        Updates the status of a scheduled message.

        Args:
            scheduled_message_id (int): The ID of the scheduled message to update.
            status (str): The new status (e.g., 'processing', 'sent', 'failed', 'cancelled').
            error_message (str, optional): An error message if the status is 'failed'.

        Returns:
            ScheduledMessage | None: The updated ScheduledMessage object or None if not found.
        """
        message = self.db.query(ScheduledMessage).filter(ScheduledMessage.id == scheduled_message_id).first()
        if message:
            message.status = status
            if error_message:
                message.error_message_if_any = error_message # Assuming ScheduledMessage has this field
            message.updated_at = datetime.datetime.now(datetime.timezone.utc)
            try:
                self.db.commit()
                self.db.refresh(message)
                return message
            except Exception as e:
                self.db.rollback()
                # Log error e
                raise e
        return None

    def delete_scheduled_message(self, scheduled_message_id: int) -> bool:
        """
        Deletes a scheduled message.
        It's generally better to mark messages as 'cancelled' than to hard delete.
        This method provides hard deletion if required.

        Args:
            scheduled_message_id (int): The ID of the scheduled message to delete.

        Returns:
            bool: True if deletion was successful, False otherwise.
        """
        message = self.db.query(ScheduledMessage).filter(ScheduledMessage.id == scheduled_message_id).first()
        if message:
            # Consider only allowing deletion if status is 'pending' or 'cancelled'
            # if message.status not in ['pending', 'cancelled']:
            #     raise ValueError(f"Cannot delete message in '{message.status}' state.")
            self.db.delete(message)
            try:
                self.db.commit()
                return True
            except Exception as e:
                self.db.rollback()
                # Log error e
                raise e
        return False

# Example Usage (requires database_setup.py and database_models.py)
if __name__ == '__main__':
    from database_setup import init_db, get_db_session

    # Initialize DB (use default SQLite for this example)
    engine = init_db()
    
    # Get a session
    db_session = get_db_session()

    try:
        scheduler = MessageScheduler(db_session)

        # 0. Create dummy MessageContent, ContactList (if they don't exist)
        # For simplicity, assume they exist or handle their creation here.
        # This is just for testing the scheduler logic.
        sample_content = db_session.query(MessageContent).first()
        if not sample_content:
            sample_content = MessageContent(name="Test Content", body_text="Hello!")
            db_session.add(sample_content)
            db_session.commit()
            db_session.refresh(sample_content)

        sample_list = db_session.query(ContactList).first()
        if not sample_list:
            sample_list = ContactList(name="Test List")
            db_session.add(sample_list)
            db_session.commit()
            db_session.refresh(sample_list)
        
        sample_contact_wa_id = "1234567890"
        sample_contact = db_session.query(Contact).filter(Contact.whatsapp_id == sample_contact_wa_id).first()
        if not sample_contact:
            sample_contact = Contact(name="Test Contact", whatsapp_id=sample_contact_wa_id)
            db_session.add(sample_contact)
            db_session.commit()
            db_session.refresh(sample_contact)


        # 1. Add a scheduled message for a contact list (broadcast)
        scheduled_time_list = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=10)
        try:
            list_message = scheduler.add_scheduled_message(
                message_content_id=sample_content.id,
                contact_list_id=sample_list.id,
                scheduled_time=scheduled_time_list,
                is_group_message=True 
            )
            print(f"Added list message: {list_message.id} for list {sample_list.id} at {list_message.scheduled_time}")
        except ValueError as e:
            print(f"Error adding list message: {e}")


        # 2. Add a scheduled message for a direct target
        scheduled_time_direct = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=5)
        try:
            direct_message = scheduler.add_scheduled_message(
                message_content_id=sample_content.id,
                target_whatsapp_id=sample_contact.whatsapp_id, # Use an actual WhatsApp ID from your Contact table
                scheduled_time=scheduled_time_direct
            )
            print(f"Added direct message: {direct_message.id} for {sample_contact.whatsapp_id} at {direct_message.scheduled_time}")
        except ValueError as e:
            print(f"Error adding direct message: {e}")


        # 3. Get pending messages (set scheduled_time in the past for testing this part)
        # For testing get_pending_messages, let's add one for the past
        past_time = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=1)
        try:
            past_message = scheduler.add_scheduled_message(
                message_content_id=sample_content.id,
                target_whatsapp_id=sample_contact.whatsapp_id,
                scheduled_time=past_time
            )
            if past_message:
                 print(f"Added past message for testing: {past_message.id}")
        except ValueError as e:
            print(f"Error adding past message: {e}")


        pending = scheduler.get_pending_messages()
        print(f"\nPending messages ({len(pending)}):")
        for msg in pending:
            print(f" - ID: {msg.id}, Target: {msg.target_whatsapp_id or msg.contact_list_id}, Time: {msg.scheduled_time}, Status: {msg.status}")
            # Update its status to 'processing' for testing update
            if msg.id == past_message.id: # only process the one we know is due
                scheduler.update_message_status(msg.id, "processing")
                print(f"   Updated status of {msg.id} to 'processing'")


        # 4. Check status update
        if pending:
            updated_msg = scheduler.db.query(ScheduledMessage).filter(ScheduledMessage.id == past_message.id).first()
            if updated_msg:
                print(f"\nMessage {updated_msg.id} after status update: Status='{updated_msg.status}'")

        # 5. Delete a message (e.g., the list message if it exists)
        if list_message:
            deleted = scheduler.delete_scheduled_message(list_message.id)
            print(f"\nDeletion of message {list_message.id} successful: {deleted}")
            # Verify deletion
            if deleted:
                found_deleted = db_session.query(ScheduledMessage).filter(ScheduledMessage.id == list_message.id).first()
                print(f"Message {list_message.id} found after deletion attempt: {found_deleted is not None}")


    except Exception as e:
        print(f"An error occurred during scheduler example: {e}")
        db_session.rollback()
    finally:
        db_session.close()
        print("\nScheduler example finished. DB session closed.")
