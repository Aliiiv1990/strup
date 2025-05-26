# Research: Persian NLP Libraries/Tools for Python

This document summarizes findings on Python libraries and tools suitable for Natural Language Processing (NLP) tasks on Persian text, specifically focusing on keyword extraction and sentiment analysis.

## Prominent Python Libraries for Persian NLP

Several Python libraries offer a range of tools for Persian language processing. The most notable ones include:

1.  **Hazm (هضم):**
    *   **Overview:** Hazm is arguably the most popular and comprehensive library for Persian NLP in Python. It provides a wide array of functionalities, making it a strong candidate for many tasks.
    *   **Key Features Relevant to Research:**
        *   **Tokenization:** Word and sentence tokenization specifically adapted for Persian.
        *   **Normalization:** Includes rules for normalizing Persian text (e.g., unifying character variations, handling ZWNJ).
        *   **Stemming & Lemmatization:** Reduces words to their root or base form, which is crucial for keyword extraction and canonical representation.
        *   **Part-of-Speech (POS) Tagging:** Identifies the grammatical role of words in a sentence. Useful for more advanced keyword extraction (e.g., focusing on nouns and verbs).
        *   **Chunking & Parsing:** Can identify syntactic phrases and parse sentence structure.
        *   **Corpus Readers:** Provides access to commonly used Persian corpora (e.g., Bijankhan, Hamshahri).
    *   **Keyword Extraction Potential:** Hazm's lemmatization, POS tagging, and tokenization are fundamental building blocks for various keyword extraction algorithms (e.g., TF-IDF, RAKE, or simply identifying frequent nouns/noun phrases).
    *   **Sentiment Analysis Potential:** While Hazm itself might not have a dedicated, pre-trained sentiment analysis module out-of-the-box for all use cases, its text processing capabilities are essential for preparing text for sentiment analysis models. One might need to train a sentiment classifier using Hazm-processed features or use its tools in conjunction with other sentiment resources. Some community efforts or extensions might provide pre-trained sentiment models compatible with Hazm.
    *   **Considerations:**
        *   Actively maintained and widely used in the Persian NLP community.
        *   Good documentation and examples are generally available.
        *   Relies on some external resources (e.g., for lemmatization models) that need to be downloaded.

2.  **Parsivar (پارسی‌ور):**
    *   **Overview:** Parsivar is another significant Python library for Persian text processing, offering similar functionalities to Hazm.
    *   **Key Features Relevant to Research:**
        *   **Normalization:** Text cleaning and normalization.
        *   **Tokenization:** Word and sentence tokenization.
        *   **Stemming:** Provides different stemming algorithms.
        *   **POS Tagging:** Available.
    *   **Keyword Extraction Potential:** Similar to Hazm, Parsivar's tools can be used to preprocess text for keyword extraction techniques.
    *   **Sentiment Analysis Potential:** Like Hazm, Parsivar focuses on foundational NLP tasks. Sentiment analysis would typically require building a model on top of Parsivar's processed text or integrating with other sentiment lexicons/tools.
    *   **Considerations:**
        *   Offers a good set of tools, sometimes with different underlying algorithms or models compared to Hazm, which might be beneficial for comparative analysis.
        *   Check for recent maintenance and community support status.

3.  **DadmaTools:**
    *   **Overview:** A newer toolkit that aims to provide state-of-the-art models for Persian NLP, often leveraging transformer-based architectures (like BERT variations fine-tuned for Persian).
    *   **Key Features Relevant to Research:**
        *   **Pre-trained Models:** May offer pre-trained models for tasks like sentiment analysis, named entity recognition (NER), and text classification, which can be more powerful than traditional methods if available and suitable.
        *   **Fine-tuning Capabilities:** Allows fine-tuning of transformer models on custom Persian datasets.
    *   **Keyword Extraction Potential:** While not its primary focus for "traditional" keyword extraction, NER capabilities could be used to extract named entities as keywords. Its embeddings can also be used for semantic keyword/phrase identification.
    *   **Sentiment Analysis Potential:** This is a strong area for DadmaTools if they provide pre-trained Persian sentiment models (e.g., ParsBERT-Sentiment). These models are often more accurate than lexicon-based or simple machine learning approaches.
    *   **Considerations:**
        *   Can be more resource-intensive (due to transformer models) than Hazm or Parsivar for some tasks.
        *   The availability and maturity of specific pre-trained models for sentiment analysis and keyword-related tasks should be verified.
        *   Might have a steeper learning curve if unfamiliar with transformer architectures.

## Specific Considerations for Tasks

### Keyword Extraction:

*   **General Approach:**
    1.  **Preprocessing:** Use Hazm or Parsivar for text normalization, tokenization, and potentially stemming/lemmatization.
    2.  **Algorithm:**
        *   **Frequency-based:** Count word/lemma frequencies (TF-IDF is common).
        *   **POS-based:** Extract nouns, noun phrases, or significant verbs.
        *   **Graph-based:** Algorithms like TextRank or RAKE.
        *   **Embeddings:** Use word embeddings (from DadmaTools or other sources) to find semantically similar terms to a query or identify key concepts.
*   No single library might offer a one-shot "extract_keywords" function that works perfectly for all contexts. It usually involves a pipeline.

### Sentiment Analysis:

*   **Lexicon-based:** Requires a Persian sentiment lexicon (a list of words and their sentiment scores). This approach is simpler but might be less accurate than model-based methods. Some community-created lexicons might exist.
*   **Machine Learning (Traditional):**
    1.  **Preprocessing:** Use Hazm/Parsivar for text cleaning and feature extraction (e.g., Bag-of-Words, TF-IDF from processed text).
    2.  **Training:** Train a classifier (e.g., Naive Bayes, SVM, Logistic Regression) on a labeled Persian sentiment dataset.
*   **Deep Learning / Transformers (e.g., using DadmaTools):**
    1.  Utilize pre-trained Persian language models (like ParsBERT) that have been fine-tuned for sentiment analysis. This often yields the best performance if such models are available and applicable.
    2.  Fine-tune a general Persian language model on a custom sentiment dataset.

## Summary & Recommendations

*   **For foundational Persian text processing (normalization, tokenization, stemming, POS tagging):** **Hazm** is a very strong and widely recommended starting point due to its comprehensive nature and active community. **Parsivar** is a good alternative.
*   **For Keyword Extraction:** Combine Hazm/Parsivar for preprocessing with standard algorithms (TF-IDF, RAKE) or custom logic based on POS tags.
*   **For Sentiment Analysis:**
    *   If high accuracy is needed and resources allow, investigate pre-trained sentiment models from **DadmaTools** (or similar transformer-based resources for Persian).
    *   Otherwise, building a custom classifier using features extracted via Hazm/Parsivar from a labeled dataset is a viable approach.
    *   Simpler lexicon-based methods can be a quick starting point but may lack nuance.

Further investigation into the specific datasets available for training/fine-tuning and the exact requirements of the "keywords" (e.g., single words, phrases, named entities) will help in choosing the optimal combination of tools.

## Practical Implementation Notes for Keyword Extraction (Simulated with Hazm in Mind)

When implementing keyword extraction, even with a comprehensive library like Hazm, several practical points arise:

1.  **Preprocessing Pipeline Order:**
    *   **Normalization:** Should be one of the first steps to unify character representations (e.g., 'ي' vs 'ی', ZWNJ handling).
    *   **Tokenization:** Follows normalization. `hazm.word_tokenize` is generally robust.
    *   **Stop Word Removal:** Applied after tokenization. `hazm.stopwords_list()` provides a good baseline. This list might need customization depending on the domain (e.g., adding business-specific common but non-informative words).
    *   **Lemmatization/Stemming:** Applied to tokens after stop word removal. `hazm.Lemmatizer` helps consolidate different forms of a word (e.g., "کتاب‌ها" and "کتاب" both map to "کتاب"). This is crucial for accurate frequency counting. The lemmatizer might return `word#POS_tag`; splitting by `#` can yield the base word.
    *   **Case Folding (for stop words):** If not handled by the normalizer, ensure tokens and stop words are compared in a consistent case (e.g., all lowercase) if the stop word list is case-sensitive. Persian is less reliant on case than English, but consistency helps.

2.  **Stop Word List Management:**
    *   Hazm's default list is good but may not be exhaustive for all specific domains.
    *   Consider allowing users to add custom stop words relevant to their business or message content to improve the quality of extracted keywords.
    *   The stop word list should ideally be loaded once and reused, not reloaded for every message processing call, for efficiency.

3.  **Keyword Refinement:**
    *   **Minimum Length Filter:** Short tokens (e.g., 1 or 2 characters, after removing stop words) are often noise and can be filtered out.
    *   **POS Tag Filtering (Advanced):** For more targeted keywords, one might filter tokens based on their POS tags (e.g., keeping only nouns, adjectives, or verbs). This requires POS tagging as part of the pipeline.
    *   **Frequency Threshold:** Besides `top_n`, a minimum frequency threshold could be applied to filter out very rare words that might not be significant.

4.  **Performance:**
    *   For large volumes of text, applying a full NLP pipeline to every message can be computationally intensive.
    *   Processing messages in batches and optimizing NLP object instantiation (e.g., Normalizer, Lemmatizer should be initialized once if possible) are important.

5.  **Contextual Keywords (Beyond Single Words):**
    *   The described approach focuses on single-word keywords. For multi-word keywords (n-grams or phrases), techniques like extracting noun phrases (using Hazm's chunker) or looking at co-occurring frequent words would be needed.

Simulating these steps (as done in `AnalyticsService._simulate_hazm_preprocessing`) helps structure the logic, but replacing them with actual Hazm calls is necessary for accurate and meaningful Persian keyword extraction. The quality of keywords heavily depends on the thoroughness of these preprocessing steps.

## Sentiment Analysis Implementation (Simulated)

Implementing sentiment analysis for Persian text involves several key stages, from preparing the text to interpreting model outputs. The simulation in `AnalyticsService._simulate_sentiment_analysis` is a basic placeholder for these more complex steps.

1.  **Text Preprocessing:**
    *   Similar to keyword extraction, robust preprocessing is crucial for accurate sentiment analysis. This typically involves:
        *   **Normalization:** Using `Hazm.Normalizer` or equivalent to unify character representations, handle special characters, and correct common spacing issues.
        *   **Tokenization:** Breaking text into words or sub-word units. `Hazm.word_tokenize` is suitable for word-level tokenization. For transformer-based models (e.g., from `DadmaTools`), specific tokenizers aligned with the model (like SentencePiece or WordPiece) are used.
        *   **Stop Word Removal (Optional but often beneficial for simpler models):** Removing common words that don't carry significant sentiment. `Hazm.stopwords_list()` can be used. However, for some transformer models, stop words might be retained as they can provide context.
        *   **Lemmatization (Less common for direct input to transformers, but useful for feature engineering):** Reducing words to their base form can help consolidate sentiment signals for traditional ML models.
    *   The goal is to prepare the text in a format that the chosen sentiment analysis model expects.

2.  **Choosing a Sentiment Analysis Model/Approach:**

    *   **Transformer-based Models (e.g., from DadmaTools):**
        *   These models (like ParsBERT, ALBERT-Persian fine-tuned for sentiment) generally offer the highest accuracy.
        *   `DadmaTools` might provide direct pipelines or models for sentiment classification.
        *   **Usage:** Input preprocessed (usually just normalized and tokenized with the model's specific tokenizer) text to the model, which outputs sentiment probabilities (e.g., positive, negative, neutral) or a direct label.
    *   **Traditional Machine Learning Models:**
        *   **Feature Extraction:** Convert preprocessed text (normalized, tokenized, lemmatized, stop words removed) into numerical features. Common techniques include:
            *   Bag-of-Words (BoW)
            *   TF-IDF (Term Frequency-Inverse Document Frequency)
        *   **Model Training:** Train a classifier (e.g., Naive Bayes, SVM, Logistic Regression) on a labeled Persian sentiment dataset (text samples tagged with 'positive', 'negative', 'neutral').
        *   `Hazm`'s tools are essential for the feature extraction phase.
    *   **Lexicon-based (Rule-based):**
        *   Utilizes a pre-defined Persian sentiment lexicon where words are assigned sentiment scores.
        *   The overall sentiment of a text is calculated by aggregating the scores of its words.
        *   This approach is simpler but often less accurate and struggles with negation, sarcasm, and context. Community-created Persian sentiment lexicons might be available.

3.  **Interpreting Model Output:**
    *   Models typically output:
        *   **Categorical Labels:** Directly 'positive', 'negative', 'neutral'.
        *   **Numerical Scores/Probabilities:** E.g., `{'positive': 0.7, 'negative': 0.2, 'neutral': 0.1}`. A threshold (e.g., highest probability) is used to determine the final label.
    *   This output is then aggregated, as simulated in `AnalyticsService.get_sentiment_overview`, to provide an overview of sentiment distribution across a set of messages.

4.  **Simulation in `AnalyticsService`:**
    *   The `_simulate_sentiment_analysis` method uses a highly simplified keyword-spotting approach and random assignment.
    *   **This is NOT a valid NLP technique for real-world use** but serves to illustrate where the actual sentiment analysis logic would be integrated and how its output (a sentiment label) would be consumed by the system.
    *   For a production system, this simulation must be replaced with calls to a robust Persian sentiment analysis model chosen from the approaches described above.

The choice of method depends on accuracy requirements, available resources (labeled data, computational power), and development time. Transformer models from libraries like `DadmaTools` are often the state-of-the-art if readily available and applicable.

## Intent Recognition for Chatbots (Simulated)

Intent recognition is a core component of Natural Language Understanding (NLU) in chatbots, enabling them to understand the user's goal or purpose behind a message, even if the phrasing isn't an exact match to a predefined rule. This makes chatbots more flexible and conversational than purely rule-based systems.

### Role of Intent Recognition

*   **Beyond Keywords:** While basic rules trigger on specific keywords, intent recognition aims to capture the underlying meaning. For example, "سفارشم کی میرسه؟", "وضعیت ارسال چیه؟", and "بسته من کجاست؟" all express the "order_status" intent.
*   **Handling Variation:** Users express the same need in many different ways. Intent recognition, powered by machine learning, can generalize from training examples to understand varied phrasings.
*   **Driving Dialogue:** Once an intent is recognized, the chatbot can take appropriate action, like asking for more information (e.g., an order number for "order_status") or providing a specific answer.

### Typical Steps in Intent Recognition

1.  **Preprocessing:**
    *   Similar to keyword extraction and sentiment analysis, text must be cleaned and prepared.
    *   **Normalization:** Using `Hazm.Normalizer` for Persian to unify characters, handle spacing, etc.
    *   **Tokenization:** Breaking text into words (e.g., `Hazm.word_tokenize`) or sub-word units.
    *   **Lemmatization/Stemming (Optional, model-dependent):** Reducing words to their base form can help generalize, especially for traditional ML models. `Hazm.Lemmatizer` is suitable. Some advanced models (like transformers) might perform better with less aggressive stemming.
    *   **Stop Word Removal (Optional, model-dependent):** May or may not be beneficial depending on the model.

2.  **Feature Extraction:**
    *   Converting the preprocessed text into a numerical representation that machine learning models can understand.
    *   **TF-IDF (Term Frequency-Inverse Document Frequency):** Represents text based on the importance of words.
    *   **Word Embeddings (e.g., Word2Vec, FastText, or from Transformers like ParsBERT):** Captures semantic meaning and relationships between words. These are often more powerful. `DadmaTools` might provide access to Persian embeddings or facilitate their use with transformer models.

3.  **Model Training or Usage:**
    *   **Training Data:** A dataset of user utterances labeled with their corresponding intents is required (e.g., "سفارشم کی میرسه؟" -> "order_status").
    *   **Machine Learning Models:**
        *   **Traditional Classifiers:** SVMs, Logistic Regression, Naive Bayes can be trained on TF-IDF features.
        *   **Deep Learning Models:** CNNs, LSTMs, or more commonly, Transformer-based models (like BERT, RoBERTa, ALBERT fine-tuned for Persian) achieve state-of-the-art results. Libraries like `DadmaTools` may provide pre-trained Persian models that can be fine-tuned for intent classification.
        *   **NLU Frameworks:** Tools like **Rasa NLU** provide a complete framework for building intent recognition and entity extraction components. They often include pipelines for multiple languages and allow integration of custom components or pre-trained models.
    *   **Pre-trained Models:** If available, pre-trained intent recognition models for Persian can significantly speed up development, though they might need fine-tuning for specific domains.

4.  **Entity Extraction (Often coupled with Intent Recognition):**
    *   While intent recognition identifies the user's goal, entity extraction identifies specific pieces of information within the user's message.
    *   For example, if the intent is "order_status", entities might include "order_number" or "date".
    *   Recognizing entities is crucial for fulfilling the intent (e.g., "برای پیگیری وضعیت سفارش، لطفا شماره سفارش خود را وارد کنید." – the chatbot needs to extract the order number from the user's next message).
    *   Libraries like `Hazm` (for basic chunking/NER) or transformer models from `DadmaTools` (for more advanced NER) can be used. Rasa NLU also has strong entity extraction capabilities.

### Simulation in `ChatbotService`

*   The `_simulate_intent_recognition` method in `ChatbotService` uses a **highly simplified keyword-spotting approach**. It defines intents with lists of associated keywords ("all_of", "any_of").
*   This simulation **does not involve any machine learning, feature extraction, or true NLP model training**. It's a placeholder to demonstrate where intent logic would fit into the chatbot's workflow.
*   **Limitations of Simulation:**
    *   Cannot handle variations in phrasing well.
    *   Not robust to typos or grammatical differences.
    *   Does not learn from new examples.
    *   Keyword lists need manual maintenance and can become complex to manage for many intents.
*   For a production-grade chatbot, this simulation must be replaced with a proper NLU pipeline leveraging the NLP libraries and techniques discussed above (e.g., Hazm for preprocessing, potentially DadmaTools or Rasa NLU for intent classification and entity extraction).

### Dialog Management Considerations

While intent recognition and entity extraction help in understanding a single user message, many useful chatbot interactions require multiple turns of conversation. This is where **Dialog Management** becomes crucial.

*   **Tracking Context:** Dialog management systems are responsible for tracking the conversation's state and context over time. This includes remembering previous user inputs, chatbot responses, and any information gathered (entities).
*   **Guiding Conversations:** Based on the current state and recognized intent, the dialog manager decides the chatbot's next action. This could be:
    *   Asking a clarifying question.
    *   Requesting missing information (e.g., asking for an order number after an "order_status" intent).
    *   Providing the final answer or performing an action once all necessary information is gathered.
    *   Handling unexpected user responses or changes in topic.
*   **Stateful Interactions:** This allows the chatbot to move beyond simple single-shot question-answering and engage in more complex, goal-oriented interactions like booking appointments, troubleshooting issues, or processing orders step-by-step.
*   **Implementation Approaches:**
    *   **Simple State Machines:** For basic dialogs, a state machine can be explicitly coded.
    *   **Rule-Based Systems:** More complex rules can define conversation flows.
    *   **Statistical/Reinforcement Learning Models:** Advanced dialog managers can be trained using machine learning (e.g., Rasa Core uses an ML-based approach to learn dialog policies).
*   **Conceptual Notes:** For initial considerations on how dialog management could be integrated into the current project structure, refer to the `_conceptual_dialog_management_notes()` method within `chatbot_service.py`. These notes outline basic ideas for state storage (e.g., using a database table like `ConversationState`) and state transition logic that would be necessary to build multi-turn capabilities.

Effectively managing dialog state is key to creating a chatbot that feels coherent and can successfully complete tasks that require more than one user-bot exchange.
