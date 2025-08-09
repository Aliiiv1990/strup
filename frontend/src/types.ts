// Entry for a car being sold, populated from image analysis
export interface SellerEntry {
  id: string; // Unique ID for React key
  rowIndex: number; // Display row index
  imageFileName?: string; // Original file name of the uploaded image - Made optional
  imageUrl?: string; // Temporary Blob URL for image preview, not persisted
  originalFile?: File; // The actual file for re-processing if needed - Made optional

  // Data extracted by Gemini - these are now per car, but structure remains for entry
  اسم_ماشین?: string;
  سال_ساخت?: string;
  رنگ?: string;

  // These are typically top-level from Gemini response for sellers
  کارکرد_کیلومتر?: string;
  قیمت_تومان?: string;
  اسم_فروشنده?: string;

  status: 'processing' | 'success' | 'error';
  errorMessage?: string;
}

// Entry for a car purchase request, populated from image analysis
export interface BuyerEntry {
  id:string; // Unique ID for React key
  rowIndex: number; // Display row index

  imageFileName?: string; // Original file name if populated from image
  imageUrl?: string; // Temporary Blob URL for image preview, not persisted
  originalFile?: File; // The actual file if populated from image

  // Data extracted by Gemini - these are now per car
  اسم_ماشین?: string;
  سال_ساخت?: string;
  رنگ?: string;

  // These are typically top-level from Gemini response for buyers
  اسم_مشتری?: string;
  بودجه_تقریبی_تومان?: string;
  توضیحات_بیشتر?: string;

  status: 'processing' | 'success' | 'error';
  errorMessage?: string;
}

// Details for a single car within the Gemini response
export interface CarDetail {
  اسم_ماشین?: string;
  سال_ساخت?: string;
  رنگ?: string;
  // Potentially other car-specific fields if Gemini can provide them per car
}

// Expected structure of the unified JSON response from Gemini
export interface UnifiedGeminiResponse {
  نوع_آگهی: "فروشنده" | "خریدار" | "نامفهوم";

  خودروها: CarDetail[]; // Array of car details

  // Seller top-level fields (optional, present if نوع_آگهی is "فروشنده")
  کارکرد_کیلومتر?: string;
  قیمت_تومان?: string;
  اسم_فروشنده?: string;

  // Buyer top-level fields (optional, present if نوع_آگهی is "خریدار")
  اسم_مشتری?: string;
  بودجه_تقریبی_تومان?: string;
  توضیحات_بیشتر?: string;

  // Optional field for Gemini to provide a reason if unclear
  دلیل_نامفهوم_بودن?: string;
}


// Used for parts in Gemini request
export interface TextPart {
  text: string;
}

export interface InlineDataPart {
  inlineData: {
    mimeType: string;
    data: string;
  };
}

export interface ImageOptimizationSettings {
  enableResizing: boolean;
  maxWidthOrHeight: number;
  enableCompression: boolean;
  compressionQuality: number; // 0.1 to 1.0 for JPEG
}

// Output of image processing utility - now returns a Blob instead of base64
export interface ProcessedImageOutput {
  blob: Blob;
  mimeType: string;
}

// Definition for API model choices used in settings
export interface ApiModelChoice {
  id: string;
  label: string;
  value: string;
}

// --- Types for Suggestion Logic ---
export interface ParsedBuyerPreferences {
  id: string;
  name: string;
  modelRaw: string;
  modelNormalized: string;
  yearPrefText: string;
  minYear: number | null;
  maxYear: number | null;
  colorPrefText: string;
  colorsParsed: string[];
  pricePrefText: string;
  minPrice: number | null;
  maxPrice: number | null;
  rowIndex: number;
  originalBuyerEntry: BuyerEntry;
}

export interface ProcessedSellerCar {
  id: string;
  modelRaw: string;
  modelNormalized: string;
  yearRaw: string;
  yearInt: number | null;
  colorRaw: string;
  colorsParsed: string[];
  mileage: number | null; // Assuming mileage is numeric if present
  price: number | null;
  sellerName: string;
  rowIndex: number;
  originalSellerEntry: SellerEntry;
}

export interface SuggestionEntry {
  id: string; // Unique ID for React key: buyerId-sellerCarId

  // Buyer Info
  buyerId: string; // ID of the buyer's entry to fetch image
  buyerImageFileName?: string; // Filename of buyer's image if it exists
  buyerName: string;
  buyerCarModel: string; // Raw text
  buyerYearPref: string; // Raw text
  buyerColorPref: string; // Raw text
  buyerPricePref: string; // Raw text

  // Suggested Car Info
  suggestedCarId?: string; // ID of the car to fetch from IndexedDB
  suggestedCarImageFileName?: string; // Original filename of the suggested car's image
  suggestedCarModel: string; // Raw text
  suggestedCarYear: string;  // Raw text
  suggestedCarColor: string; // Raw text
  suggestedCarMileage: string; // Formatted string
  suggestedCarPrice: string;   // Formatted string
  suggestedCarSellerName: string;

  // Score Info
  finalScore: number;
  scoreDetails: string; // Concatenated reasons
}

// --- Types for Model Normalization ---
export interface CarModelNormalizationRule {
  id: string; // UUID for React keys and management
  targetName: string;
  aliases: string[];
}

// Type for selecting the AI provider
export type AiProvider = 'google-gemini' | 'aval-ai';
