from sqlalchemy import create_engine, Column, Integer, String, DateTime, Text, ForeignKey, JSON, Boolean, Table
from sqlalchemy.orm import relationship, declarative_base
from sqlalchemy.sql import func
import datetime

Base = declarative_base()

# Association table for the many-to-many relationship between Contact and ContactList
contact_list_association = Table('contact_list_association', Base.metadata,
    Column('contact_id', Integer, ForeignKey('contacts.id'), primary_key=True),
    Column('contact_list_id', Integer, ForeignKey('contact_lists.id'), primary_key=True)
)

class Contact(Base):
    __tablename__ = 'contacts'

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255))
    whatsapp_id = Column(String(255), nullable=False, unique=True, index=True) # Phone number or WhatsApp ID
    custom_fields_json = Column(JSON) # For storing arbitrary additional contact info
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationship to ContactList (many-to-many)
    contact_lists = relationship("ContactList",
                                 secondary=contact_list_association,
                                 back_populates="contacts")
    
    scheduled_messages = relationship("ScheduledMessage", back_populates="target_contact")
    sent_messages = relationship("SentMessageLog", back_populates="recipient_contact")

    def __repr__(self):
        return f"<Contact(id={self.id}, name='{self.name}', whatsapp_id='{self.whatsapp_id}')>"

class ContactList(Base):
    __tablename__ = 'contact_lists'

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, unique=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationship to Contact (many-to-many)
    contacts = relationship("Contact",
                            secondary=contact_list_association,
                            back_populates="contact_lists")
    
    scheduled_messages = relationship("ScheduledMessage", back_populates="target_contact_list")

    def __repr__(self):
        return f"<ContactList(id={self.id}, name='{self.name}')>"

class MessageContent(Base):
    __tablename__ = 'message_contents'

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, unique=True) # e.g., "Welcome Message", "Holiday Promo"
    body_text = Column(Text, nullable=False)
    media_url_if_any = Column(String(1024)) # URL to image, video, or document
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    scheduled_messages = relationship("ScheduledMessage", back_populates="message_content")

    def __repr__(self):
        return f"<MessageContent(id={self.id}, name='{self.name}')>"

class ScheduledMessage(Base):
    __tablename__ = 'scheduled_messages'

    id = Column(Integer, primary_key=True, index=True)
    
    message_content_id = Column(Integer, ForeignKey('message_contents.id'), nullable=False)
    message_content = relationship("MessageContent", back_populates="scheduled_messages")

    # Scheduling can be for a list or an individual contact/group
    contact_list_id = Column(Integer, ForeignKey('contact_lists.id'), nullable=True) # For sending to a whole list
    target_contact_list = relationship("ContactList", back_populates="scheduled_messages")
    
    target_whatsapp_id = Column(String(255), ForeignKey('contacts.whatsapp_id'), nullable=True) # For sending to a specific contact not in a list or a group
    target_contact = relationship("Contact", back_populates="scheduled_messages")
    
    # If target_whatsapp_id is a group ID, this should be true.
    # Note: WhatsApp Cloud API has limitations on group messaging. This field helps manage intent.
    is_group_message = Column(Boolean, default=False) 
    
    scheduled_time = Column(DateTime(timezone=True), nullable=False, index=True)
    status = Column(String(50), default='pending', index=True) # e.g., pending, processing, sent, failed, cancelled
    personalization_data_json = Column(JSON, nullable=True) # For storing broadcast-level or specific personalization data
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    sent_log_entries = relationship("SentMessageLog", back_populates="scheduled_message_origin")

    def __repr__(self):
        return f"<ScheduledMessage(id={self.id}, status='{self.status}', scheduled_time='{self.scheduled_time}')>"

class SentMessageLog(Base):
    __tablename__ = 'sent_message_logs'

    id = Column(Integer, primary_key=True, index=True)
    
    # Link to a scheduled message if it originated from there
    scheduled_message_id = Column(Integer, ForeignKey('scheduled_messages.id'), nullable=True) 
    scheduled_message_origin = relationship("ScheduledMessage", back_populates="sent_log_entries")
    
    # For ad-hoc messages not part of a schedule, we'd still log the content used.
    # For simplicity, not adding a direct link to MessageContent here to avoid circular dependencies or complexity,
    # assuming ad-hoc messages might have their content logged directly or referenced differently.
    # If an ad-hoc message uses a MessageContent, its ID could be stored in a JSON field if needed.
    
    message_content_name_snapshot = Column(String(255)) # Snapshot of the content name used
    message_body_snapshot = Column(Text) # Snapshot of the body text sent

    whatsapp_message_id_from_api = Column(String(255), index=True, nullable=True) # ID received from WhatsApp API on successful send
    
    recipient_whatsapp_id = Column(String(255), ForeignKey('contacts.whatsapp_id'), nullable=False, index=True)
    recipient_contact = relationship("Contact", back_populates="sent_messages")

    status_from_webhook = Column(String(50), index=True) # e.g., sent, delivered, read, failed, deleted
    sent_time = Column(DateTime(timezone=True), default=func.now, index=True)
    status_updated_time = Column(DateTime(timezone=True), nullable=True, onupdate=func.now) # When the status_from_webhook was last updated
    
    error_message_if_any = Column(Text)
    
    # If it was a message to a group, this might store the group ID.
    # The recipient_whatsapp_id would then be the group ID.
    is_group_message_log = Column(Boolean, default=False)

    def __repr__(self):
        return f"<SentMessageLog(id={self.id}, recipient_whatsapp_id='{self.recipient_whatsapp_id}', status='{self.status_from_webhook}')>"


class ReceivedMessageLog(Base):
    __tablename__ = 'received_message_logs'

    id = Column(Integer, primary_key=True, index=True)
    whatsapp_message_id = Column(String(255), nullable=False, unique=True, index=True) # Message ID from WhatsApp
    
    sender_whatsapp_id = Column(String(255), ForeignKey('contacts.whatsapp_id'), nullable=False, index=True) # From which contact/user
    sender_contact = relationship("Contact", foreign_keys=[sender_whatsapp_id]) # Relationship to Contact

    recipient_whatsapp_id = Column(String(255), nullable=False, index=True) # To which of our business numbers
    
    message_body_text = Column(Text, nullable=True) # Text content of the message
    media_url_if_any = Column(String(1024), nullable=True) # URL if it's a media message
    
    # From WhatsApp webhook: text, image, audio, video, document, location, contacts, sticker, unsupported, system
    message_type = Column(String(50), nullable=False, index=True) 
    
    received_at_timestamp = Column(DateTime(timezone=True), default=func.now, index=True) # Timestamp of receipt by our server
    whatsapp_timestamp = Column(DateTime(timezone=True), nullable=True) # Timestamp from the WhatsApp message itself if available

    # Potentially add fields for context if replying to another message, location data, etc.
    # context_whatsapp_message_id = Column(String(255), nullable=True) 

    def __repr__(self):
        return f"<ReceivedMessageLog(id={self.id}, from='{self.sender_whatsapp_id}', type='{self.message_type}')>"

# Example of how to create an engine and tables (typically in your main app setup)
# SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db" # Or PostgreSQL, MySQL etc.
# engine = create_engine(SQLALCHEMY_DATABASE_URL)

# def create_db_and_tables():
#     Base.metadata.create_all(bind=engine)

# if __name__ == "__main__":
#     create_db_and_tables()
#     print("Database tables created.")
#     # You can add example usage here if needed for testing
#     from sqlalchemy.orm import sessionmaker
#     SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
#     db = SessionLocal()
#     # Example: new_contact = Contact(name="John Doe", whatsapp_id="1234567890")
#     # db.add(new_contact)
#     # db.commit()
#     # db.close()
