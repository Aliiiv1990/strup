import type { ImageOptimizationSettings, ApiModelChoice } from './types';

export const DEFAULT_GEMINI_API_MODEL = 'gemini-1.5-flash';
export const DEFAULT_MAX_CONCURRENT_REQUESTS = 3;
export const DEFAULT_REQUEST_INTERVAL_MS = 2000; // 2 seconds
export const DEFAULT_BATCH_SIZE = 1; // Default to 1 for old behavior
export const AVALAI_API_URL = 'https://api.avalai.ir/v1/chat/completions';
export const NUM_GEMINI_API_KEYS = 5;
export const DEFAULT_KEY_ROTATION_THRESHOLD = 50;

export const PREDEFINED_MODELS: ApiModelChoice[] = [
  { id: "gemini_1_5_flash", label: "Gemini 1.5 Flash (پیشنهادی)", value: "gemini-1.5-flash" },
  { id: "custom", label: "مدل سفارشی (ورود دستی)", value: "custom" }
];

export const DEFAULT_IMAGE_OPTIMIZATION_SETTINGS: ImageOptimizationSettings = {
  enableResizing: true,
  maxWidthOrHeight: 1024, // pixels
  enableCompression: true,
  compressionQuality: 0.7, // 70% for JPEG
};


export const AI_IMAGE_BATCH_EXTRACTION_PROMPT = `
You are an expert automotive data extractor. You will be given {image_count} items, each consisting of an image and an optional caption from its filename.
The items are numbered 1 to {image_count}. Their corresponding filenames and captions are:
{filenames_list_with_captions}

Your task is to analyze EACH item (image + its caption) independently and return a single, valid JSON array.
The array MUST contain exactly {image_count} JSON objects. The i-th object in the array MUST correspond to the i-th input item.

For EACH item, perform the following steps and construct a JSON object:

1.  **Classify Listing Type:**
    -   "فروشنده": If the item shows a car for sale.
    -   "خریدار": If it's a request to buy a car.
    -   "نامفهوم": If the intent is unclear.
    The classification MUST be in the "نوع_آگهی" field.

2.  **Extract Car Details:**
    -   If the item mentions multiple distinct cars (e.g., "فروش رانا و 206"), provide details for EACH car in an array named "خودروها".
    -   Each object in "خودروها" must have: "اسم_ماشین", "سال_ساخت", and "رنگ".
    -   The "خودروها" array is mandatory for "فروشنده" and "خریدار" types, even with one car.

3.  **Extract Top-Level Fields:**
    -   For "فروشنده": "کارکرد_کیلومتر", "قیمت_تومان", "اسم_فروشنده". Use placeholders like "[توافقی]" or "[توسط کاربر وارد شود]" if info is not found.
    -   For "خریدار": "اسم_مشتری", "بودجه_تقریبی_تومان", "توضیحات_بیشتر". Use an empty string "" if info is not found.

4.  **Handle Unclear Items:**
    -   For "نامفهوم", optionally provide a "دلیل_نامفهوم_بودن" field.

**Final Output Requirement:**
-   Respond with ONLY the JSON array. No additional text, no markdown.
-   The response MIME type is "application/json".
-   The final structure must be: [ { ...JSON for item 1... }, { ...JSON for item 2... }, ... ]
`;

export const AI_TEXT_BATCH_EXTRACTION_PROMPT = `
You are an expert automotive data extractor. You will be given {text_count} text blocks from car listings.
Their corresponding filenames are:
{filenames_list}

Your task is to analyze EACH text block independently and return a single, valid JSON array.
The array MUST contain exactly {text_count} JSON objects. The i-th object in the array MUST correspond to the i-th input text block.

For EACH text, perform the following steps and construct a JSON object:

1.  **Classify Listing Type:**
    -   "فروشنده": If the text describes a car for sale.
    -   "خریدار": If it's a request to buy a car.
    -   "نامفهوم": If the intent is unclear.
    The classification MUST be in the "نوع_آگهی" field.

2.  **Extract Car Details:**
    -   If the text mentions multiple distinct cars, provide details for EACH car in an array named "خودروها".
    -   Each object in "خودروها" must have: "اسم_ماشین", "سال_ساخت", and "رنگ".
    -   The "خودروها" array is mandatory for "فروشنده" and "خریدار" types, even with one car.

3.  **Extract Top-Level Fields:**
    -   For "فروشنده": "کارکرد_کیلومتر", "قیمت_تومان", "اسم_فروشنده". Use placeholders like "[توافقی]" or "[توسط کاربر وارد شود]" if info is not found.
    -   For "خریدار": "اسم_مشتری", "بودجه_تقریبی_تومان", "توضیحات_بیشتر". Use an empty string "" if info is not found.

4.  **Handle Unclear Text:**
    -   For "نامفهوم", optionally provide a "دلیل_نامفهوم_بودن" field.

**Final Output Requirement:**
-   Respond with ONLY the JSON array. No additional text, no markdown.
-   The response MIME type is "application/json".
-   The final structure must be: [ { ...JSON for text 1... }, { ...JSON for text 2... }, ... ]

The text blocks are provided below, separated by '---'.
{text_blocks}
`;
