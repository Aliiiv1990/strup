import datetime
from sqlalchemy.orm import Session
from sqlalchemy import func, and_ # Added 'and_' for combining filters
from database_models import SentMessageLog, ReceivedMessageLog # Assuming models are accessible
from database_setup import get_db_session # For type hinting

class AnalyticsService:
    def __init__(self, db_session_factory): # Typically a function like get_db_session
        """
        Initializes the AnalyticsService.

        Args:
            db_session_factory (function): A function that returns a new SQLAlchemy session.
                                          Example: database_setup.get_db_session
        """
        self.get_db_session = db_session_factory
        print("AnalyticsService initialized.")

    def get_message_counts(self, 
                           start_date: datetime.datetime, 
                           end_date: datetime.datetime, 
                           direction: str = 'all') -> dict:
        """
        Queries SentMessageLog and ReceivedMessageLog to count messages.

        Args:
            start_date (datetime.datetime): The start of the date range (inclusive).
            end_date (datetime.datetime): The end of the date range (inclusive).
                                          For full day, use end of day (e.g., 23:59:59).
            direction (str, optional): 'sent', 'received', or 'all'. Defaults to 'all'.

        Returns:
            dict: Counts of 'sent', 'received', and 'total' messages.
                  Example: {'sent': 10, 'received': 15, 'total': 25}
        """
        db = self.get_db_session()
        counts = {'sent': 0, 'received': 0, 'total': 0}

        # Ensure timezone awareness matches database storage.
        # If DB stores naive datetimes, ensure start_date and end_date are naive.
        # If DB stores UTC (recommended), ensure start_date and end_date are UTC.
        # For this example, assuming datetime objects passed are already correctly timezone-aware
        # or naive as per DB storage.

        try:
            if direction in ['sent', 'all']:
                sent_query = db.query(func.count(SentMessageLog.id)).filter(
                    and_( # Use and_ for multiple conditions
                        SentMessageLog.sent_time >= start_date,
                        SentMessageLog.sent_time <= end_date
                    )
                )
                counts['sent'] = sent_query.scalar() or 0

            if direction in ['received', 'all']:
                received_query = db.query(func.count(ReceivedMessageLog.id)).filter(
                    and_( # Use and_ for multiple conditions
                        ReceivedMessageLog.received_at_timestamp >= start_date, # Or whatsapp_timestamp depending on desired logic
                        ReceivedMessageLog.received_at_timestamp <= end_date
                    )
                )
                counts['received'] = received_query.scalar() or 0
            
            if direction == 'sent':
                counts['total'] = counts['sent']
            elif direction == 'received':
                counts['total'] = counts['received']
            else: # 'all'
                counts['total'] = counts['sent'] + counts['received']
                
        except Exception as e:
            print(f"Error getting message counts: {e}")
            # Optionally re-raise or return error state
        finally:
            db.close()
            
        return counts

    # Requires Hazm library: pip install hazm
    # For actual implementation, uncomment Hazm imports and processing steps.
    # from hazm import Normalizer, word_tokenize, Lemmatizer #, stopwords_list (load it once)
    # hazm_stopwords = stopwords_list() # Load once if using Hazm's list
    
    def _simulate_hazm_preprocessing(self, text: str) -> list[str]:
        """
        Simulates Hazm preprocessing steps: normalization, tokenization,
        stop word removal, and lemmatization.
        """
        if not text:
            return []

        # 1. Normalization (Simulated - Hazm: Normalizer().normalize(text))
        # normalizer = Normalizer() 
        # normalized_text = normalizer.normalize(text)
        normalized_text = text # Placeholder for actual normalization

        # 2. Tokenization (Simulated - Hazm: word_tokenize(normalized_text))
        # tokens = word_tokenize(normalized_text)
        tokens = normalized_text.split() # Simple split for simulation

        # 3. Stop Word Removal (Simulated with a small predefined list)
        # In a real scenario, use: from hazm import stopwords_list; persian_stopwords = stopwords_list()
        # This list should be loaded once, not per call.
        simulated_persian_stopwords = [
            "و", "در", "به", "از", "که", "این", "آن", "است", "هست", "بود", "شد", "کرد", "شود", "کند",
            "با", "برای", "تا", "یک", "دو", "سه", "نه", "هم", "پس", "خب", "من", "تو", "او", "ما", "شما", "ایشان",
            "اگر", "اما", "ولی", "یا", "نیز", "باید", "شاید", "چون", "چیزی", "کسی", "جایی", "واقعا", "الان", "امروز",
            "هر", "همه", "هیچ", "دیگر", "را", "دیگه", "فقط", "حتی", "یعنی", "مثلا", "سلام", "خداحافظ", "مرسی",
            "ای", "ها", "های", "ترین", "تر", "شان", "تان", "مان", "ام", "ات", "اش" # Common affixes/pronoun endings that might be split if not lemmatized
        ] 
        # This simulated list is very basic and needs to be replaced by Hazm's stopwords_list() for real use.
        
        processed_tokens = [token for token in tokens if token.lower() not in simulated_persian_stopwords and len(token) > 2] # Basic length filter, lowercase for stopword matching

        # 4. Lemmatization (Simulated - Hazm: Lemmatizer().lemmatize(token))
        # lemmatizer = Lemmatizer()
        # lemmatized_tokens = [lemmatizer.lemmatize(token).split('#')[0] for token in processed_tokens] # Hazm lemmatizer might return word#POS, so split
        # For simulation, we'll just use the tokens after stop word removal.
        # Example: "کتاب‌ها" -> "کتاب", "می‌رود" -> "رفت" (Hazm handles this well)
        lemmatized_tokens = processed_tokens # Placeholder for actual lemmatization

        return lemmatized_tokens

    def extract_common_keywords(self, 
                                start_date: datetime.datetime, 
                                end_date: datetime.datetime, 
                                top_n: int = 10, 
                                from_incoming: bool = True, 
                                from_outgoing: bool = False) -> list[tuple[str, int]]:
        """
        Extracts common keywords from message bodies within a date range.
        Uses simulated Hazm preprocessing.

        Args:
            start_date (datetime.datetime): Start of the date range.
            end_date (datetime.datetime): End of the date range.
            top_n (int): Number of top keywords to return.
            from_incoming (bool): Whether to process ReceivedMessageLog.
            from_outgoing (bool): Whether to process SentMessageLog.

        Returns:
            list[tuple[str, int]]: A list of (keyword, frequency) tuples, sorted by frequency.
        """
        db = self.get_db_session()
        all_words = []
        
        try:
            message_bodies_to_process = []
            if from_incoming:
                incoming_messages_q = db.query(ReceivedMessageLog.message_body_text).filter(
                    ReceivedMessageLog.message_body_text.isnot(None),
                    ReceivedMessageLog.received_at_timestamp >= start_date,
                    ReceivedMessageLog.received_at_timestamp <= end_date
                )
                message_bodies_to_process.extend([msg[0] for msg in incoming_messages_q.all()])

            if from_outgoing:
                outgoing_messages_q = db.query(SentMessageLog.message_body_snapshot).filter(
                    SentMessageLog.message_body_snapshot.isnot(None),
                    SentMessageLog.sent_time >= start_date,
                    SentMessageLog.sent_time <= end_date
                )
                message_bodies_to_process.extend([msg[0] for msg in outgoing_messages_q.all()])
            
            for text_body in message_bodies_to_process:
                all_words.extend(self._simulate_hazm_preprocessing(text_body))
            
            if not all_words:
                return []

            # Calculate word frequencies
            from collections import Counter # Use Counter for efficiency
            word_counts = Counter(all_words)
            
            # Get top_n most common keywords
            most_common_keywords = word_counts.most_common(top_n)
            
            return most_common_keywords

        except Exception as e:
            print(f"Error extracting common keywords: {e}")
            # Consider logging the error to a file or monitoring system
            return [] # Return empty list on error
        finally:
            db.close()

    # Requires a Persian sentiment analysis library/model (e.g., from DadmaTools or a custom model)
    # from some_sentiment_library import get_sentiment # Placeholder
    
    def _simulate_sentiment_analysis(self, text: str) -> str:
        """
        Simulates sentiment analysis of a given text.
        In a real implementation, this would call a proper sentiment analysis model.
        """
        if not text:
            return 'neutral'

        # Simple keyword-based simulation (very basic)
        positive_keywords = ["خوب", "عالی", "بهترین", "لذت", "راضی", "سپاسگزارم", "متشکریم", "پیشنهاد ویژه"]
        negative_keywords = ["بد", "مشکل", "انتقاد", "ناراضی", "متاسفانه", "شکایت"]

        text_lower = text.lower() # Basic normalization for keyword matching

        for p_word in positive_keywords:
            if p_word in text_lower:
                return 'positive'
        for n_word in negative_keywords:
            if n_word in text_lower:
                return 'negative'
        
        # Random assignment for more variety in simulation if no keywords match
        import random
        return random.choice(['positive', 'negative', 'neutral'])


    def get_sentiment_overview(self, 
                               start_date: datetime.datetime, 
                               end_date: datetime.datetime, 
                               from_incoming: bool = True, 
                               from_outgoing: bool = False) -> dict:
        """
        Provides an overview of message sentiments within a date range.
        Uses simulated sentiment analysis.

        Args:
            start_date (datetime.datetime): Start of the date range.
            end_date (datetime.datetime): End of the date range.
            from_incoming (bool): Process ReceivedMessageLog.
            from_outgoing (bool): Process SentMessageLog.

        Returns:
            dict: A summary of sentiment distribution (e.g., {'positive': 10, 'negative': 2, 'neutral': 5}).
        """
        db = self.get_db_session()
        sentiment_counts = {'positive': 0, 'negative': 0, 'neutral': 0}
        
        try:
            message_bodies_to_process = []
            if from_incoming:
                incoming_messages_q = db.query(ReceivedMessageLog.message_body_text).filter(
                    ReceivedMessageLog.message_body_text.isnot(None),
                    ReceivedMessageLog.received_at_timestamp >= start_date,
                    ReceivedMessageLog.received_at_timestamp <= end_date
                )
                message_bodies_to_process.extend([msg[0] for msg in incoming_messages_q.all()])

            if from_outgoing:
                outgoing_messages_q = db.query(SentMessageLog.message_body_snapshot).filter(
                    SentMessageLog.message_body_snapshot.isnot(None),
                    SentMessageLog.sent_time >= start_date,
                    SentMessageLog.sent_time <= end_date
                )
                message_bodies_to_process.extend([msg[0] for msg in outgoing_messages_q.all()])

            if not message_bodies_to_process:
                return sentiment_counts # Return zero counts if no messages

            for text_body in message_bodies_to_process:
                # In a real implementation, call the actual sentiment analysis function here
                # sentiment = get_sentiment(text_body) 
                sentiment = self._simulate_sentiment_analysis(text_body)
                
                if sentiment in sentiment_counts:
                    sentiment_counts[sentiment] += 1
                else:
                    # This case should ideally not happen if _simulate_sentiment_analysis is controlled
                    sentiment_counts['neutral'] += 1 # Default to neutral if unknown sentiment returned
            
            return sentiment_counts

        except Exception as e:
            print(f"Error getting sentiment overview: {e}")
            # Consider logging the error
            return sentiment_counts # Return current counts on error
        finally:
            db.close()

if __name__ == '__main__':
    from database_setup import init_db
    from database_models import Contact # To create dummy contacts for logs
    import random

    # --- Setup ---
    engine = init_db() # Default SQLite
    
    # Create a session for setup
    setup_db = get_db_session()

    # Create dummy contacts if they don't exist
    contact_wa_ids = ["111222001", "111222002", "111222003"]
    for wa_id in contact_wa_ids:
        contact = setup_db.query(Contact).filter(Contact.whatsapp_id == wa_id).first()
        if not contact:
            setup_db.add(Contact(name=f"AnalyticsUser {wa_id[-3:]}", whatsapp_id=wa_id))
    setup_db.commit()
    
    # --- Populate with some dummy log data for testing ---
    now = datetime.datetime.now(datetime.timezone.utc)
    
    # Sent messages
    for i in range(15):
        sent_log = SentMessageLog(
            recipient_whatsapp_id=random.choice(contact_wa_ids),
            message_content_name_snapshot=f"Test Sent Content {i}",
            message_body_snapshot=f"This is test sent message {i}.",
            status_from_webhook='delivered', # a common final status
            whatsapp_message_id_from_api=f"wamid.sent.{now.timestamp() + i}",
            sent_time=now - datetime.timedelta(days=random.randint(0, 5), hours=random.randint(0,23))
        )
        setup_db.add(sent_log)

    # Received messages
    for i in range(20):
        received_log = ReceivedMessageLog(
            whatsapp_message_id=f"wamid.recv.{now.timestamp() + i}",
            sender_whatsapp_id=random.choice(contact_wa_ids),
            recipient_whatsapp_id="our_business_num_1", # Your business number receiving the message
            message_body_text=f"This is a test received message {i}.",
            message_type='text',
            received_at_timestamp=now - datetime.timedelta(days=random.randint(0, 5), hours=random.randint(0,23)),
            whatsapp_timestamp=now - datetime.timedelta(days=random.randint(0, 5), hours=random.randint(0,23))
        )
        setup_db.add(received_log)
    
    try:
        setup_db.commit()
        print("Dummy log data populated.")
    except Exception as e:
        setup_db.rollback()
        print(f"Error populating dummy data: {e}")
    finally:
        setup_db.close()

    # --- Initialize Service ---
    analytics_service = AnalyticsService(db_session_factory=get_db_session)

    # --- Test get_message_counts ---
    print("\n--- Testing get_message_counts ---")
    
    start_of_query_range = now - datetime.timedelta(days=2) # Last 2 days
    end_of_query_range = now # Until now

    print(f"Querying from {start_of_query_range.strftime('%Y-%m-%d %H:%M')} to {end_of_query_range.strftime('%Y-%m-%d %H:%M')}")

    # Test 'all'
    counts_all = analytics_service.get_message_counts(start_of_query_range, end_of_query_range)
    print(f"Direction 'all': Sent={counts_all['sent']}, Received={counts_all['received']}, Total={counts_all['total']}")

    # Test 'sent'
    counts_sent = analytics_service.get_message_counts(start_of_query_range, end_of_query_range, direction='sent')
    print(f"Direction 'sent': Sent={counts_sent['sent']}, Received={counts_sent['received']}, Total={counts_sent['total']}")

    # Test 'received'
    counts_received = analytics_service.get_message_counts(start_of_query_range, end_of_query_range, direction='received')
    print(f"Direction 'received': Sent={counts_received['sent']}, Received={counts_received['received']}, Total={counts_received['total']}")
    
    # Test a range with potentially no messages
    start_future = now + datetime.timedelta(days=10)
    end_future = now + datetime.timedelta(days=12)
    print(f"\nQuerying future range from {start_future.strftime('%Y-%m-%d %H:%M')} to {end_future.strftime('%Y-%m-%d %H:%M')}")
    counts_future = analytics_service.get_message_counts(start_future, end_future)
    print(f"Future Range (all): Sent={counts_future['sent']}, Received={counts_future['received']}, Total={counts_future['total']}")

    # --- Test extract_common_keywords ---
    print("\n--- Testing extract_common_keywords ---")
    # Add some Persian example text to logs for keyword extraction
    setup_db_keywords = get_db_session()
    try:
        # Add sample received messages with Persian text
        persian_text_samples_received = [
            "سلام وقت بخیر. این یک پیام تست برای استخراج کلمات کلیدی است. کلمات کلیدی مهم هستند.",
            "با سلام خدمت شما. امیدوارم حال شما خوب باشد. این سرویس خیلی خوب است.",
            "تست دیگری از کلمات. کلمات تکراری برای تست فراوانی.",
            "کتاب خوبی بود. از خواندن کتاب لذت بردم.",
            "این یک پیام عادی است."
        ]
        for i, text in enumerate(persian_text_samples_received):
            setup_db_keywords.add(ReceivedMessageLog(
                whatsapp_message_id=f"wamid.recv.persian.{now.timestamp() + i}",
                sender_whatsapp_id=random.choice(contact_wa_ids),
                recipient_whatsapp_id="our_business_num_1",
                message_body_text=text,
                message_type='text',
                received_at_timestamp=now - datetime.timedelta(hours=random.randint(0,47)) # within last 2 days
            ))
        
        # Add sample sent messages with Persian text
        persian_text_samples_sent = [
            "سلام مشتری عزیز. پیشنهاد ویژه برای شما: کتاب جدید ما.",
            "از خرید شما متشکریم. امیدواریم از سرویس ما راضی باشید. سرویس ما بهترین است.",
            "کلمات کلیدی تکراری در پیام ارسالی. کلمات کلمات."
        ]
        for i, text in enumerate(persian_text_samples_sent):
            setup_db_keywords.add(SentMessageLog(
                recipient_whatsapp_id=random.choice(contact_wa_ids),
                message_content_name_snapshot=f"Persian Test Sent Content {i}",
                message_body_snapshot=text,
                status_from_webhook='delivered',
                whatsapp_message_id_from_api=f"wamid.sent.persian.{now.timestamp() + i}",
                sent_time=now - datetime.timedelta(hours=random.randint(0,47)) # within last 2 days
            ))
        setup_db_keywords.commit()
        print("Added Persian sample messages for keyword extraction.")
    except Exception as e:
        setup_db_keywords.rollback()
        print(f"Error adding Persian sample messages: {e}")
    finally:
        setup_db_keywords.close()

    # Test keyword extraction from incoming messages
    keywords_incoming = analytics_service.extract_common_keywords(start_of_query_range, end_of_query_range, top_n=5, from_incoming=True, from_outgoing=False)
    print(f"\nTop 5 keywords from INCOMING messages:")
    for keyword, freq in keywords_incoming:
        print(f"- '{keyword}': {freq}")

    # Test keyword extraction from outgoing messages
    keywords_outgoing = analytics_service.extract_common_keywords(start_of_query_range, end_of_query_range, top_n=5, from_incoming=False, from_outgoing=True)
    print(f"\nTop 5 keywords from OUTGOING messages:")
    for keyword, freq in keywords_outgoing:
        print(f"- '{keyword}': {freq}")

    # Test keyword extraction from all messages
    keywords_all = analytics_service.extract_common_keywords(start_of_query_range, end_of_query_range, top_n=7, from_incoming=True, from_outgoing=True)
    print(f"\nTop 7 keywords from ALL messages:")
    for keyword, freq in keywords_all:
        print(f"- '{keyword}': {freq}")

    # --- Test get_sentiment_overview ---
    print("\n--- Testing get_sentiment_overview ---")
    # Using the same date range as keyword extraction for consistency in test data
    
    # Test sentiment from incoming messages
    sentiment_incoming = analytics_service.get_sentiment_overview(start_of_query_range, end_of_query_range, from_incoming=True, from_outgoing=False)
    print(f"\nSentiment overview from INCOMING messages: {sentiment_incoming}")

    # Test sentiment from outgoing messages
    sentiment_outgoing = analytics_service.get_sentiment_overview(start_of_query_range, end_of_query_range, from_incoming=False, from_outgoing=True)
    print(f"\nSentiment overview from OUTGOING messages: {sentiment_outgoing}")

    # Test sentiment from all messages
    sentiment_all = analytics_service.get_sentiment_overview(start_of_query_range, end_of_query_range, from_incoming=True, from_outgoing=True)
    print(f"\nSentiment overview from ALL messages: {sentiment_all}")
        
    print("\n--- AnalyticsService Example Finished ---")
