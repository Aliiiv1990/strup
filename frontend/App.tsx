import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { SellerEntry, BuyerEntry, UnifiedGeminiResponse, ImageOptimizationSettings, ProcessedImageOutput, SuggestionEntry, CarModelNormalizationRule, CarDetail, AiProvider } from './types';
// import ImageUploader from './components/ImageUploader'; // No longer needed
import SellerCarDataTable from './components/CarDataTable';
import BuyerRequestTable from './components/BuyerRequestTable';
import SuggestionListTable from './components/SuggestionListTable';
import SettingsModal from './components/SettingsModal';
import ImageModal from './components/ImageModal';
import TextModal from './components/TextModal';
import ModelNormalizationManager from './components/ModelNormalizationManager';
import ManualSellerEntryModal from './components/ManualSellerEntryModal';
import ManualBuyerEntryModal from './components/ManualBuyerEntryModal';
import { extractDataFromImages, extractDataFromTexts } from './services/geminiService';
import { imageDB } from './services/imageDB';
import {
    DEFAULT_GEMINI_API_MODEL,
    DEFAULT_MAX_CONCURRENT_REQUESTS,
    PREDEFINED_MODELS,
    DEFAULT_IMAGE_OPTIMIZATION_SETTINGS,
    DEFAULT_REQUEST_INTERVAL_MS,
    DEFAULT_BATCH_SIZE,
    NUM_GEMINI_API_KEYS,
    DEFAULT_KEY_ROTATION_THRESHOLD
} from './constants';
import { processImage } from './utils/imageProcessor';
import { generateAllSuggestions, normalizeCarModelAdvanced } from './utils/suggestionLogic';
import { toEnglishDigitsIfNeeded, toPersianDigits } from './utils/numberFormatter';
import Spinner from './components/Spinner';
import JSZip from 'jszip';

const LOCAL_STORAGE_SELLER_KEY = 'carApp.sellerEntries';
const LOCAL_STORAGE_BUYER_KEY = 'carApp.buyerEntries';

// --- Helper Functions (generateUUID, escapeCsvCell, etc.) ---
// (These functions remain unchanged)
const generateUUID = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  let d = new Date().getTime();
  let d2 = (typeof performance !== 'undefined' && performance.now && (performance.now() * 1000)) || 0;
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    let r = Math.random() * 16;
    if (d > 0) { r = (d + r) % 16 | 0; d = Math.floor(d / 16); }
    else { r = (d2 + r) % 16 | 0; d2 = Math.floor(d2 / 16); }
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
};

const escapeCsvCell = (cellData: string | number | undefined | null): string => {
  if (cellData === null || cellData === undefined) return '';
  const stringData = String(cellData);
  if (stringData.includes(',') || stringData.includes('"') || stringData.includes('\n')) {
    return `"${stringData.replace(/"/g, '""')}"`;
  }
  return stringData;
};

interface QueuedFile {
  file: File;
  uniqueId: string; // ID of the placeholder entry
  type: 'image' | 'text';
  caption: string;
  senderId: string;
  placeholderImageUrl?: string; // Blob URL for immediate display (images only)
}

const normalizeSearchString = (str?: string): string => {
  if (!str) return "";
  return str.trim().toLowerCase()
    .replace(/ي/g, "ی") // Arabic Yeh to Persian Yeh
    .replace(/ك/g, "ک"); // Arabic Kaf to Persian Kaf
};

const normalizeRuleStringForComparison = (str: string): string => {
    return str.trim().toLowerCase().replace(/ي/g, "ی").replace(/ك/g, "ک");
};

const convertBlobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result.split(',')[1]);
      } else {
        reject(new Error("Failed to read blob as base64 string."));
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(blob);
  });
};

const parseFilename = (filename: string): { senderId: string; uniqueId: string; caption: string } => {
    const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.'));
    const parts = nameWithoutExt.split('_');

    if (parts.length < 2) {
        console.warn(`Unexpected filename format, cannot parse: ${filename}`);
        return { senderId: 'ناشناس', uniqueId: nameWithoutExt || generateUUID(), caption: '' };
    }

    const senderId = parts[0];
    const uniqueId = parts[1];
    const caption = parts.slice(2).join(' ').trim().replace(/\s+/g, ' '); // Join remaining parts with space

    return { senderId, uniqueId, caption };
};


const App: React.FC = () => {
  // --- Existing State Declarations ---
  const [sellerEntries, setSellerEntries] = useState<SellerEntry[]>([]);
  const [buyerEntries, setBuyerEntries] = useState<BuyerEntry[]>([]);
  const [suggestionEntries, setSuggestionEntries] = useState<SuggestionEntry[]>([]);
  const [isProcessingOverall, setIsProcessingOverall] = useState(false);
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);
  const [activeTab, setActiveTab] = useState<'sellers' | 'buyers' | 'suggestions'>('sellers');
  const [apiKeyStatus, setApiKeyStatus] = useState<string>("درحال بررسی وضعیت کلید API...");
  const [activeRequestCount, setActiveRequestCount] = useState(0);
  const [fileQueue, setFileQueue] = useState<QueuedFile[]>([]);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [aiProviderState, setAiProviderState] = useState<AiProvider>('google-gemini');
  const [avalaiApiKeyState, setAvalaiApiKeyState] = useState<string>('');
  const [geminiApiKeysState, setGeminiApiKeysState] = useState<string[]>(Array(NUM_GEMINI_API_KEYS).fill(''));
  const [currentApiKeyIndex, setCurrentApiKeyIndex] = useState(0);
  const [imagesProcessedWithCurrentKey, setImagesProcessedWithCurrentKey] = useState(0);
  const [keyRotationThresholdState, setKeyRotationThresholdState] = useState<number>(DEFAULT_KEY_ROTATION_THRESHOLD);
  const [selectedModelIdState, setSelectedModelIdState] = useState<string>(PREDEFINED_MODELS[0].id);
  const [customApiModelState, setCustomApiModelState] = useState<string>('');
  const [maxConcurrentRequestsState, setMaxConcurrentRequestsState] = useState<number>(DEFAULT_MAX_CONCURRENT_REQUESTS);
  const [requestIntervalState, setRequestIntervalState] = useState<number>(DEFAULT_REQUEST_INTERVAL_MS);
  const [batchSizeState, setBatchSizeState] = useState<number>(DEFAULT_BATCH_SIZE);
  const [imageOptimizationSettingsState, setImageOptimizationSettingsState] = useState<ImageOptimizationSettings>(DEFAULT_IMAGE_OPTIMIZATION_SETTINGS);
  const [enlargedImageInfo, setEnlargedImageInfo] = useState<{ url: string; fileName: string, objectUrlToRevoke?: string } | null>(null);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [textModalInfo, setTextModalInfo] = useState<{ content: string; fileName: string } | null>(null);
  const [isTextModalOpen, setIsTextModalOpen] = useState(false);
  const [carModelNormalizationRules, setCarModelNormalizationRules] = useState<CarModelNormalizationRule[]>([]);
  const [dominantKeywords, setDominantKeywords] = useState<string[]>([]);
  const [showManualSellerModal, setShowManualSellerModal] = useState(false);
  const [showManualBuyerModal, setShowManualBuyerModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [deletionConfirmation, setDeletionConfirmation] = useState<{ id: string; type: 'seller' | 'buyer' } | null>(null);
  const [editingEntry, setEditingEntry] = useState<{ id: string; type: 'seller' | 'buyer'; data: Partial<SellerEntry & BuyerEntry> } | null>(null);
  const loadSessionInputRef = useRef<HTMLInputElement>(null);
  const lastRequestTimestamp = useRef(0);
  const isInitialLoadDone = useRef(false);

  // --- NEW State for Auto-Fetching ---
  const [autoFetchStatus, setAutoFetchStatus] = useState('در انتظار اولین بررسی...');
  const processedFileNames = useRef(new Set<string>());


  // --- Existing useEffects for loading, saving, etc. ---
  // (These remain largely unchanged)
  useEffect(() => {
    // Load App Settings
    const storedProvider = localStorage.getItem('appSettings.aiProvider');
    const storedAvalaiKey = localStorage.getItem('appSettings.avalaiApiKey');
    const storedGeminiKeys = localStorage.getItem('appSettings.geminiApiKeys');
    const storedActiveKeyIndex = localStorage.getItem('appSettings.currentApiKeyIndex');
    const storedImagesProcessed = localStorage.getItem('appSettings.imagesProcessedWithCurrentKey');
    const storedKeyRotationThreshold = localStorage.getItem('appSettings.keyRotationThreshold');
    const storedModelId = localStorage.getItem('appSettings.selectedModelId');
    const storedCustomModel = localStorage.getItem('appSettings.customApiModel');
    const storedConcurrency = localStorage.getItem('appSettings.maxConcurrentRequests');
    const storedRequestInterval = localStorage.getItem('appSettings.requestInterval');
    const storedBatchSize = localStorage.getItem('appSettings.batchSize');
    const storedImageOpt = localStorage.getItem('appSettings.imageOptimization');
    const storedNormalizationRules = localStorage.getItem('appSettings.carModelNormalizationRules');
    const storedDominantKeywords = localStorage.getItem('appSettings.dominantKeywords');

    if (storedProvider === 'google-gemini' || storedProvider === 'aval-ai') setAiProviderState(storedProvider);
    if (storedAvalaiKey) setAvalaiApiKeyState(storedAvalaiKey);
    if (storedGeminiKeys) {
        try {
            const parsedKeys = JSON.parse(storedGeminiKeys);
            if (Array.isArray(parsedKeys) && parsedKeys.length === NUM_GEMINI_API_KEYS) {
                setGeminiApiKeysState(parsedKeys);
            }
        } catch (e) { console.error("Failed to parse Gemini keys", e); }
    }
    if (storedActiveKeyIndex) setCurrentApiKeyIndex(parseInt(storedActiveKeyIndex, 10) || 0);
    if (storedImagesProcessed) setImagesProcessedWithCurrentKey(parseInt(storedImagesProcessed, 10) || 0);
    if (storedKeyRotationThreshold) {
        const numThreshold = parseInt(storedKeyRotationThreshold, 10);
        if (!isNaN(numThreshold) && numThreshold > 0) setKeyRotationThresholdState(numThreshold);
    }
    if (storedModelId) setSelectedModelIdState(storedModelId);
    if (storedCustomModel) setCustomApiModelState(storedCustomModel);
    if (storedConcurrency) {
        const numConcurrency = parseInt(storedConcurrency, 10);
        if (!isNaN(numConcurrency) && numConcurrency > 0) setMaxConcurrentRequestsState(numConcurrency);
    }
    if (storedRequestInterval) {
        const numInterval = parseInt(storedRequestInterval, 10);
        if (!isNaN(numInterval) && numInterval >= 0) setRequestIntervalState(numInterval);
    }
    if (storedBatchSize) {
        const numBatchSize = parseInt(storedBatchSize, 10);
        if (!isNaN(numBatchSize) && numBatchSize > 0) setBatchSizeState(numBatchSize);
    }
    if (storedImageOpt) {
        try {
            const parsedOpt = JSON.parse(storedImageOpt);
            if (typeof parsedOpt.enableResizing === 'boolean') setImageOptimizationSettingsState(parsedOpt);
        } catch (e) { console.error("Failed to parse image opt settings", e); }
    }
    if (storedNormalizationRules) {
        try {
            const parsedRules = JSON.parse(storedNormalizationRules);
            setCarModelNormalizationRules(parsedRules);
        } catch (e) { console.error("Failed to parse normalization rules", e); }
    }
     if (storedDominantKeywords) {
        try {
            const parsedKeywords = JSON.parse(storedDominantKeywords) as string[];
             if (Array.isArray(parsedKeywords) && parsedKeywords.every(kw => typeof kw === 'string')) {
                setDominantKeywords(parsedKeywords.map(kw => kw.trim()).filter(kw => kw));
            }
        } catch (e) { console.error("Failed to parse dominant keywords", e); }
    }


    // Load Seller and Buyer Entries
    try {
        const storedSellers = localStorage.getItem(LOCAL_STORAGE_SELLER_KEY);
        if (storedSellers) {
            const parsedSellers: SellerEntry[] = JSON.parse(storedSellers);
            if (Array.isArray(parsedSellers)) {
                setSellerEntries(parsedSellers.map((e, i) => ({ ...e, rowIndex: i + 1, originalFile: undefined })));
                parsedSellers.forEach(e => e.imageFileName && processedFileNames.current.add(e.imageFileName));
            }
        }
        const storedBuyers = localStorage.getItem(LOCAL_STORAGE_BUYER_KEY);
        if (storedBuyers) {
            const parsedBuyers: BuyerEntry[] = JSON.parse(storedBuyers);
            if (Array.isArray(parsedBuyers)) {
                setBuyerEntries(parsedBuyers.map((e, i) => ({ ...e, rowIndex: i + 1, originalFile: undefined })));
                parsedBuyers.forEach(e => e.imageFileName && processedFileNames.current.add(e.imageFileName));
            }
        }
    } catch (e) {
        console.error("Error loading entries from localStorage:", e);
    }
    isInitialLoadDone.current = true;
  }, []);

  const isAiServiceReady = useCallback(() => {
    if (aiProviderState === 'google-gemini') {
        return geminiApiKeysState.some(key => key.trim() !== '');
    }
    if (aiProviderState === 'aval-ai') {
        return avalaiApiKeyState.trim() !== '';
    }
    return false;
  }, [aiProviderState, avalaiApiKeyState, geminiApiKeysState]);

  // --- NEW: useEffect for polling statuses from the backend ---
  useEffect(() => {
    const POLLING_INTERVAL = 10000; // 10 seconds

    const fetchAndProcessNewStatuses = async () => {
        if (!isAiServiceReady()) {
            setAutoFetchStatus('سرویس هوش مصنوعی آماده نیست. لطفاً کلید API را در تنظیمات وارد کنید.');
            return;
        }

        try {
            setAutoFetchStatus('در حال بررسی استاتوس‌های جدید...');
            const response = await fetch('/api/statuses');
            if (!response.ok) {
                throw new Error(`Server responded with ${response.status}`);
            }
            const serverFiles: string[] = await response.json();

            const allKnownFiles = new Set(processedFileNames.current);
            sellerEntries.forEach(e => e.imageFileName && allKnownFiles.add(e.imageFileName));
            buyerEntries.forEach(e => e.imageFileName && allKnownFiles.add(e.imageFileName));
            fileQueue.forEach(q => allKnownFiles.add(q.file.name));

            const newFilesToFetch = serverFiles.filter(fileName => !allKnownFiles.has(fileName));

            if (newFilesToFetch.length === 0) {
                setAutoFetchStatus(`بررسی کامل شد. استاتوس جدیدی یافت نشد. بررسی بعدی تا ۱۰ ثانیه دیگر...`);
                return;
            }

            setAutoFetchStatus(`درحال دریافت ${toPersianDigits(newFilesToFetch.length)} استاتوس جدید...`);

            const filePromises = newFilesToFetch.map(async (fileName) => {
                const fileResponse = await fetch(`/files/${fileName}`);
                if (!fileResponse.ok) {
                    console.error(`Failed to fetch file: ${fileName}`);
                    return null;
                }
                const blob = await fileResponse.blob();
                return new File([blob], fileName, { type: blob.type });
            });

            const fetchedFiles = (await Promise.all(filePromises)).filter((f): f is File => f !== null);

            if (fetchedFiles.length > 0) {
                // Create a synthetic FileList to pass to the existing handler
                const dataTransfer = new DataTransfer();
                fetchedFiles.forEach(file => dataTransfer.items.add(file));
                handleFilesSelected(dataTransfer.files);
                fetchedFiles.forEach(file => processedFileNames.current.add(file.name));
            }
             setAutoFetchStatus(`پردازش ${toPersianDigits(fetchedFiles.length)} استاتوس جدید آغاز شد. بررسی بعدی تا ۱۰ ثانیه دیگر...`);

        } catch (error) {
            console.error("Error fetching statuses:", error);
            setAutoFetchStatus(`خطا در ارتباط با سرور. بررسی بعدی تا ۱۰ ثانیه دیگر...`);
        }
    };

    // Run once on mount, then set up the interval
    fetchAndProcessNewStatuses();
    const intervalId = setInterval(fetchAndProcessNewStatuses, POLLING_INTERVAL);

    return () => clearInterval(intervalId); // Cleanup on unmount
  }, [isAiServiceReady, sellerEntries, buyerEntries, fileQueue]); // Dependencies ensure we have the latest file lists

  // --- Existing code (useEffect for saving, handlers, etc.) ---
  // (These remain unchanged, except for handleFilesSelected which is now also used by the auto-fetcher)
  useEffect(() => {
    // API Key Status
    if (aiProviderState === 'google-gemini') {
        const validKeysCount = geminiApiKeysState.filter(k => k.trim() !== '').length;
        if (validKeysCount > 0) {
            setApiKeyStatus(`وضعیت کلید (Google Gemini): ${toPersianDigits(validKeysCount)} کلید از ${toPersianDigits(NUM_GEMINI_API_KEYS)} کلید تنظیم شده و آماده استفاده است.`);
        } else {
            setApiKeyStatus(`وضعیت کلید (Google Gemini): هیچ کلید معتبری تنظیم نشده است. لطفاً در تنظیمات کلیدهای خود را وارد کنید.`);
        }
    } else if (aiProviderState === 'aval-ai') {
        if (avalaiApiKeyState.trim() !== '') {
            setApiKeyStatus("وضعیت کلید: کلید API برای سرویس AvalAI تنظیم شده است.");
        } else {
            setApiKeyStatus("وضعیت کلید (AvalAI): کلید API تنظیم نشده است. لطفاً آن را در تنظیمات وارد کنید.");
        }
    }
  }, [aiProviderState, avalaiApiKeyState, geminiApiKeysState]);


  // Save settings to localStorage
  useEffect(() => {
    localStorage.setItem('appSettings.aiProvider', aiProviderState);
    localStorage.setItem('appSettings.avalaiApiKey', avalaiApiKeyState);
    localStorage.setItem('appSettings.geminiApiKeys', JSON.stringify(geminiApiKeysState));
    localStorage.setItem('appSettings.currentApiKeyIndex', String(currentApiKeyIndex));
    localStorage.setItem('appSettings.imagesProcessedWithCurrentKey', String(imagesProcessedWithCurrentKey));
    localStorage.setItem('appSettings.keyRotationThreshold', String(keyRotationThresholdState));
    localStorage.setItem('appSettings.selectedModelId', selectedModelIdState);
    localStorage.setItem('appSettings.customApiModel', customApiModelState);
    localStorage.setItem('appSettings.maxConcurrentRequests', String(maxConcurrentRequestsState));
    localStorage.setItem('appSettings.requestInterval', String(requestIntervalState));
    localStorage.setItem('appSettings.batchSize', String(batchSizeState));
    localStorage.setItem('appSettings.imageOptimization', JSON.stringify(imageOptimizationSettingsState));
    localStorage.setItem('appSettings.carModelNormalizationRules', JSON.stringify(carModelNormalizationRules));
    localStorage.setItem('appSettings.dominantKeywords', JSON.stringify(dominantKeywords));
  }, [aiProviderState, avalaiApiKeyState, geminiApiKeysState, currentApiKeyIndex, imagesProcessedWithCurrentKey, keyRotationThresholdState, selectedModelIdState, customApiModelState, maxConcurrentRequestsState, requestIntervalState, batchSizeState, imageOptimizationSettingsState, carModelNormalizationRules, dominantKeywords]);

  // Save entries to localStorage
  useEffect(() => {
    // Exclude properties that shouldn't be saved (like File objects or temporary blob URLs)
    const sanitizedSellerEntries = sellerEntries.map(({ originalFile, imageUrl, ...rest }) => rest);
    localStorage.setItem(LOCAL_STORAGE_SELLER_KEY, JSON.stringify(sanitizedSellerEntries));
  }, [sellerEntries]);

  useEffect(() => {
    const sanitizedBuyerEntries = buyerEntries.map(({ originalFile, imageUrl, ...rest }) => rest);
    localStorage.setItem(LOCAL_STORAGE_BUYER_KEY, JSON.stringify(sanitizedBuyerEntries));
  }, [buyerEntries]);

  // Re-normalize all car names whenever normalization rules change.
  useEffect(() => {
    // Don't run on the very first render cycles before initial data is loaded from localStorage.
    if (!isInitialLoadDone.current) {
        return;
    }

    const reNormalizeEntries = <T extends SellerEntry | BuyerEntry>(entries: T[]): T[] => {
        let hasChanged = false;
        const newEntries = entries.map(entry => {
            const currentName = entry.اسم_ماشین || '';
            const newNormalizedName = normalizeCarModelAdvanced(currentName, carModelNormalizationRules, dominantKeywords);

            if (newNormalizedName !== currentName) {
                hasChanged = true;
                return { ...entry, اسم_ماشین: newNormalizedName };
            }
            return entry;
        });

        // Only update state if there was an actual change to avoid infinite render loops
        return hasChanged ? newEntries.map((e, i) => ({ ...e, rowIndex: i + 1 })) : entries;
    };

    setSellerEntries(prevEntries => reNormalizeEntries(prevEntries));
    setBuyerEntries(prevEntries => reNormalizeEntries(prevEntries));

  }, [carModelNormalizationRules, dominantKeywords]);

  const handleSaveSettings = useCallback((settings: {
    modelId: string;
    customModel: string;
    concurrency: number;
    requestInterval: number;
    batchSize: number;
    imageOptimization: ImageOptimizationSettings;
    aiProvider: AiProvider;
    avalaiApiKey: string;
    geminiApiKeys: string[];
    keyRotationThreshold: number;
  }) => {
    setAiProviderState(settings.aiProvider);
    setAvalaiApiKeyState(settings.avalaiApiKey);
    setGeminiApiKeysState(settings.geminiApiKeys);
    setSelectedModelIdState(settings.modelId);
    setCustomApiModelState(settings.customModel);
    setMaxConcurrentRequestsState(settings.concurrency);
    setRequestIntervalState(settings.requestInterval);
    setBatchSizeState(settings.batchSize);
    setImageOptimizationSettingsState(settings.imageOptimization);
    setKeyRotationThresholdState(settings.keyRotationThreshold);
    setShowSettingsModal(false);
  }, []);

  const handleClearAllStoredData = useCallback(async () => {
    try {
        await imageDB.clearImages();

        sellerEntries.forEach(entry => {
            if (entry.imageUrl) URL.revokeObjectURL(entry.imageUrl);
        });
        buyerEntries.forEach(entry => {
            if (entry.imageUrl) URL.revokeObjectURL(entry.imageUrl);
        });

        localStorage.clear(); // Clear all app settings and data
        window.location.reload();
    } catch (error) {
        console.error("Failed to clear all data:", error);
        alert("خطایی در پاک کردن داده‌ها رخ داد. لطفاً کنسول را بررسی کنید.");
    }
  }, [sellerEntries, buyerEntries]);

    const handleDeleteRequest = useCallback((id: string, type: 'seller' | 'buyer') => {
        setDeletionConfirmation({ id, type });
        setEditingEntry(null); // Cancel any active edits
    }, []);

    const handleCancelDelete = useCallback(() => {
        setDeletionConfirmation(null);
    }, []);

    const handleConfirmDelete = useCallback(async () => {
        if (!deletionConfirmation) return;

        try {
            await imageDB.deleteImage(deletionConfirmation.id);

            if (deletionConfirmation.type === 'seller') {
                setSellerEntries(prev => prev.filter(entry => entry.id !== deletionConfirmation.id));
            } else {
                setBuyerEntries(prev => prev.filter(entry => entry.id !== deletionConfirmation.id));
            }
        } catch (error) {
            console.error(`Failed to delete entry ${deletionConfirmation.id}:`, error);
            alert("خطایی در هنگام حذف رخ داد. ممکن است تصویر از پایگاه داده حذف نشده باشد.");
        } finally {
            setDeletionConfirmation(null);
        }
    }, [deletionConfirmation]);

    const handleEditRequest = useCallback((id: string, type: 'seller' | 'buyer') => {
        const entryToEdit = type === 'seller'
            ? sellerEntries.find(e => e.id === id)
            : buyerEntries.find(e => e.id === id);

        if (entryToEdit) {
            setEditingEntry({ id, type, data: { ...entryToEdit } });
            setDeletionConfirmation(null); // Cancel any pending deletions
        }
    }, [sellerEntries, buyerEntries]);

    const handleCancelEdit = useCallback(() => {
        setEditingEntry(null);
    }, []);

    const handleSaveEdit = useCallback(() => {
        if (!editingEntry) return;

        const editedData = { ...editingEntry.data };
        if (editedData.اسم_ماشین) {
            editedData.اسم_ماشین = normalizeCarModelAdvanced(
                editedData.اسم_ماشین,
                carModelNormalizationRules,
                dominantKeywords
            );
        }

        if (editingEntry.type === 'seller') {
            setSellerEntries(prev => prev.map(entry =>
                entry.id === editingEntry.id ? { ...entry, ...(editedData as SellerEntry) } : entry
            ));
        } else {
            setBuyerEntries(prev => prev.map(entry =>
                entry.id === editingEntry.id ? { ...entry, ...(editedData as BuyerEntry) } : entry
            ));
        }

        setEditingEntry(null);
    }, [editingEntry, carModelNormalizationRules, dominantKeywords]);

    const handleEditInputChange = useCallback((fieldName: keyof (SellerEntry & BuyerEntry), value: string) => {
        setEditingEntry(prev => {
            if (!prev) return null;
            return {
                ...prev,
                data: {
                    ...prev.data,
                    [fieldName]: value
                }
            };
        });
    }, []);

  const getCurrentApiModel = useCallback((): string => {
    if (selectedModelIdState === 'custom') {
        return customApiModelState.trim() || DEFAULT_GEMINI_API_MODEL;
    }
    const selectedModelObject = PREDEFINED_MODELS.find(m => m.id === selectedModelIdState);
    return selectedModelObject ? selectedModelObject.value : DEFAULT_GEMINI_API_MODEL;
  }, [selectedModelIdState, customApiModelState]);

  useEffect(() => {
    setIsProcessingOverall(activeRequestCount > 0 || fileQueue.length > 0);
  }, [activeRequestCount, fileQueue]);


  const processFileBatch = useCallback(async (batch: QueuedFile[]) => {
    setActiveRequestCount(prev => prev + 1);
    const modelToUse = getCurrentApiModel();

    const updateBatchPlaceholdersWithError = (errorMessage: string, items: QueuedFile[]) => {
      const batchIds = new Set(items.map(f => f.uniqueId));
      const updateFunction = (prev: any[]) => prev.map(entry =>
        batchIds.has(entry.id) ? { ...entry, status: 'error', errorMessage } : entry
      );
      setSellerEntries(updateFunction);
      setBuyerEntries(updateFunction);
    };

    if (!isAiServiceReady() || !modelToUse) {
      const error = apiKeyStatus;
      updateBatchPlaceholdersWithError(`سرویس هوش مصنوعی آماده نیست: ${error}`, batch);
      setActiveRequestCount(prev => Math.max(0, prev - 1));
      return;
    }

    const imageItems = batch.filter(item => item.type === 'image');
    const textItems = batch.filter(item => item.type === 'text');
    let successfulItemsCount = 0;

    const processResults = async (
        results: (UnifiedGeminiResponse[] | null),
        originalItems: QueuedFile[]
    ) => {
        if (!results) return; // Error was handled inside the processing block

        const newSellerEntries: SellerEntry[] = [];
        const newBuyerEntries: BuyerEntry[] = [];

        await Promise.all(results.map(async (extractedData, index) => {
            const originalQueuedFile = originalItems[index];
            let processedImageBlob: Blob | null = null;
            let textBlob: Blob | null = null;

            if (originalQueuedFile.type === 'image') {
                const processedOutput = await processImage(originalQueuedFile.file, imageOptimizationSettingsState);
                processedImageBlob = processedOutput.blob;
            } else if (originalQueuedFile.type === 'text') {
                const textContent = await originalQueuedFile.file.text();
                textBlob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
            }

            const processCarDetails = async (carDetails: CarDetail[], isSeller: boolean) => {
                for (const carDetail of carDetails) {
                    const newId = generateUUID();
                    const blobToSave = processedImageBlob || textBlob;
                    if (blobToSave) {
                       await imageDB.saveImage(newId, blobToSave);
                    }

                    const normalizedCarName = normalizeCarModelAdvanced(
                        carDetail.اسم_ماشین,
                        carModelNormalizationRules,
                        dominantKeywords
                    );

                    if (isSeller) {
                        newSellerEntries.push({
                            id: newId, rowIndex: 0, imageFileName: originalQueuedFile.file.name, status: 'success',
                            اسم_ماشین: normalizedCarName, سال_ساخت: carDetail.سال_ساخت, رنگ: carDetail.رنگ,
                            کارکرد_کیلومتر: extractedData.کارکرد_کیلومتر, قیمت_تومان: extractedData.قیمت_تومان,
                            اسم_فروشنده: extractedData.اسم_فروشنده || originalQueuedFile.senderId,
                        });
                    } else {
                        newBuyerEntries.push({
                            id: newId, rowIndex: 0, imageFileName: originalQueuedFile.file.name, status: 'success',
                            اسم_مشتری: extractedData.اسم_مشتری || originalQueuedFile.senderId,
                            اسم_ماشین: normalizedCarName, سال_ساخت: carDetail.سال_ساخت, رنگ: carDetail.رنگ,
                            بودجه_تقریبی_تومان: extractedData.بودجه_تقریبی_تومان, توضیحات_بیشتر: extractedData.توضیحات_بیشتر,
                        });
                    }
                }
            };

            if ((extractedData.نوع_آگهی === "فروشنده" || extractedData.نوع_آگهی === "خریدار") && extractedData.خودروها?.length > 0) {
                 await processCarDetails(extractedData.خودروها, extractedData.نوع_آگهی === "فروشنده");
            } else {
                const reason = extractedData.دلیل_نامفهوم_بودن || "نوع آگهی نامشخص یا لیست خودروها خالی بود.";
                const newId = generateUUID();
                const blobToSave = processedImageBlob || textBlob;
                if (blobToSave) {
                  await imageDB.saveImage(newId, blobToSave);
                }
                newSellerEntries.push({
                    id: newId, rowIndex: 0, imageFileName: originalQueuedFile.file.name,
                    status: 'error', errorMessage: reason,
                });
            }
        }));

        const batchIds = new Set(originalItems.map(f => f.uniqueId));
        setSellerEntries(prev => [...prev.filter(e => !batchIds.has(e.id)), ...newSellerEntries].map((e, i) => ({ ...e, rowIndex: i + 1 })));
        setBuyerEntries(prev => [...prev.filter(e => !batchIds.has(e.id)), ...newBuyerEntries].map((e, i) => ({ ...e, rowIndex: i + 1 })));
    };

    try {
        const [imageResults, textResults] = await Promise.all([
            // --- Image Processing ---
            (async () => {
                if (imageItems.length === 0) return null;
                try {
                    const imagePayloads = await Promise.all(
                        imageItems.map(async item => {
                            const processedOutput = await processImage(item.file, imageOptimizationSettingsState);
                            return {
                                data: await convertBlobToBase64(processedOutput.blob),
                                mimeType: processedOutput.mimeType,
                                fileName: item.file.name,
                                caption: item.caption,
                            };
                        })
                    );

                    const activeGeminiKey = aiProviderState === 'google-gemini' ? geminiApiKeysState[currentApiKeyIndex] : undefined;
                    const results = await extractDataFromImages(imagePayloads, modelToUse, aiProviderState, { avalaiApiKey: avalaiApiKeyState, geminiApiKey: activeGeminiKey });
                    successfulItemsCount += imageItems.length;
                    return results;
                } catch (error) {
                    console.error(`Error processing image batch:`, error);
                    updateBatchPlaceholdersWithError(error instanceof Error ? error.message : 'خطای ناشناخته', imageItems);
                    return null;
                }
            })(),

            // --- Text Processing ---
            (async () => {
                if (textItems.length === 0) return null;
                try {
                    const textPayloads = await Promise.all(
                        textItems.map(async item => ({
                            content: await item.file.text(),
                            fileName: item.file.name,
                        }))
                    );

                    const activeGeminiKey = aiProviderState === 'google-gemini' ? geminiApiKeysState[currentApiKeyIndex] : undefined;
                    const results = await extractDataFromTexts(textPayloads, modelToUse, aiProviderState, { avalaiApiKey: avalaiApiKeyState, geminiApiKey: activeGeminiKey });
                    successfulItemsCount += textItems.length;
                    return results;
                } catch (error) {
                    console.error(`Error processing text batch:`, error);
                    updateBatchPlaceholdersWithError(error instanceof Error ? error.message : 'خطای ناشناخته', textItems);
                    return null;
                }
            })(),
        ]);

        if (imageResults) await processResults(imageResults, imageItems);
        if (textResults) await processResults(textResults, textItems);

        // After all successful API calls, handle key rotation
        if (successfulItemsCount > 0 && aiProviderState === 'google-gemini') {
            setImagesProcessedWithCurrentKey(currentCount => {
                const newCount = currentCount + successfulItemsCount;
                if (newCount >= keyRotationThresholdState) {
                    const validKeyIndices = geminiApiKeysState.map((k, i) => k.trim() !== '' ? i : -1).filter(i => i !== -1);
                    if (validKeyIndices.length > 1) {
                        const currentValidIndex = validKeyIndices.indexOf(currentApiKeyIndex);
                        const nextValidIndex = (currentValidIndex + 1) % validKeyIndices.length;
                        setCurrentApiKeyIndex(validKeyIndices[nextValidIndex]);
                        console.log(`[Key Rotation] Switched from key ${currentApiKeyIndex} to ${validKeyIndices[nextValidIndex]}`);
                        return 0;
                    }
                }
                return newCount;
            });
        }
        batch.forEach(item => item.placeholderImageUrl && URL.revokeObjectURL(item.placeholderImageUrl));

    } catch (e) {
        console.error("Critical error in processFileBatch Promise.all:", e);
        updateBatchPlaceholdersWithError('خطای کلی در پردازش دسته ای', batch);
    } finally {
        setActiveRequestCount(prev => Math.max(0, prev - 1));
    }
  }, [getCurrentApiModel, imageOptimizationSettingsState, aiProviderState, avalaiApiKeyState, geminiApiKeysState, apiKeyStatus, isAiServiceReady, currentApiKeyIndex, keyRotationThresholdState, carModelNormalizationRules, dominantKeywords]);

  useEffect(() => {
    const canProcess = activeRequestCount < maxConcurrentRequestsState && fileQueue.length > 0 && isAiServiceReady();
    if (!canProcess) return;

    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTimestamp.current;

    const dispatch = () => {
      const batchToProcess = fileQueue.slice(0, batchSizeState);
      if (batchToProcess.length === 0) return;

      setFileQueue(q => q.slice(batchToProcess.length));
      processFileBatch(batchToProcess);
      lastRequestTimestamp.current = Date.now();
    };

    if (timeSinceLastRequest >= requestIntervalState) {
      dispatch();
    } else {
      const timeoutId = setTimeout(dispatch, requestIntervalState - timeSinceLastRequest);
      return () => clearTimeout(timeoutId);
    }
  }, [fileQueue, activeRequestCount, maxConcurrentRequestsState, batchSizeState, requestIntervalState, processFileBatch, isAiServiceReady]);


  const handleFilesSelected = useCallback((files: FileList) => {
    if (!isAiServiceReady()) {
        alert(`پردازش فایل‌ها امکان‌پذیر نیست. ${apiKeyStatus}`);
        return;
    }

    const newQueueItems: QueuedFile[] = [];
    const newPlaceholderEntries: SellerEntry[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const allEntries = [...sellerEntries, ...buyerEntries, ...fileQueue.map(q => ({ imageFileName: q.file.name, status: 'processing' }))];
      if (allEntries.some(e => e.imageFileName === file.name && e.status !== 'error')) {
        console.warn(`File ${file.name} already processed/in queue. Skipping.`);
        continue;
      }

      const uniqueId = generateUUID();
      const fileType = file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt') ? 'text' : 'image';
      const { senderId, caption } = parseFilename(file.name);

      let placeholderEntry: SellerEntry;

      if (fileType === 'image') {
          const placeholderBlobUrl = URL.createObjectURL(file);
          placeholderEntry = {
              id: uniqueId,
              rowIndex: 0,
              imageFileName: file.name,
              imageUrl: placeholderBlobUrl,
              originalFile: file,
              status: 'processing',
              اسم_فروشنده: senderId,
          };
          newQueueItems.push({ file, uniqueId, type: 'image', caption, senderId, placeholderImageUrl: placeholderBlobUrl });
      } else { // text
          placeholderEntry = {
              id: uniqueId,
              rowIndex: 0,
              imageFileName: file.name,
              status: 'processing',
              اسم_فروشنده: senderId,
          };
          newQueueItems.push({ file, uniqueId, type: 'text', caption: '', senderId });
      }
      newPlaceholderEntries.push(placeholderEntry);
    }

    if (newPlaceholderEntries.length > 0) {
        setSellerEntries(prev => {
            const combined = [...prev, ...newPlaceholderEntries];
            return combined.map((entry, idx) => ({...entry, rowIndex: idx + 1}));
        });
    }
    if (newQueueItems.length > 0) {
        setFileQueue(prev => [...prev, ...newQueueItems]);
    }
  }, [sellerEntries, buyerEntries, fileQueue, apiKeyStatus, isAiServiceReady]);

  const handleSaveSession = useCallback(async () => {
    try {
      const zip = new JSZip();

      const sellersToSave = sellerEntries.map(({ originalFile, imageUrl, ...rest }) => rest);
      const buyersToSave = buyerEntries.map(({ originalFile, imageUrl, ...rest }) => rest);

      const sessionData = {
        version: 2,
        sellers: sellersToSave,
        buyers: buyersToSave,
        normalizationRules: carModelNormalizationRules,
        dominantKeywords: dominantKeywords,
      };

      zip.file('session.json', JSON.stringify(sessionData, null, 2));

      const dataFolder = zip.folder('data');
      if (!dataFolder) throw new Error("Could not create data folder in zip");

      const dataEntries = [...sellerEntries, ...buyerEntries].filter(
          e => e.status === 'success' && e.imageFileName && e.imageFileName !== 'ورودی دستی'
      );

      const dataPromises = dataEntries.map(async (entry) => {
          const blob = await imageDB.getImage(entry.id);
          if (blob) {
              dataFolder.file(entry.id, blob);
          }
      });
      await Promise.all(dataPromises);

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      const timestamp = new Date().toISOString().replace(/:/g, '-').slice(0, 19);
      link.download = `car_session_${timestamp}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

    } catch (error) {
      console.error("Failed to create session ZIP:", error);
      alert("خطا در ایجاد فایل ZIP جلسه.");
    }
  }, [sellerEntries, buyerEntries, carModelNormalizationRules, dominantKeywords]);

  const handleLoadJsonSession = async (fileContent: string) => {
    try {
        const data = JSON.parse(fileContent);

        if (!data.version || !Array.isArray(data.sellers) || !Array.isArray(data.buyers)) {
            throw new Error("فرمت فایل JSON نامعتبر است یا نسخه آن پشتیبانی نمی‌شود.");
        }

        const sellerSignature = (s: SellerEntry) => [s.imageFileName, s.اسم_ماشین, s.سال_ساخت, s.رنگ, s.کارکرد_کیلومتر, s.قیمت_تومان, s.اسم_فروشنده].map(val => normalizeSearchString(String(val || ''))).join('|');
        const buyerSignature = (b: BuyerEntry) => [b.imageFileName, b.اسم_مشتری, b.اسم_ماشین, b.سال_ساخت, b.رنگ, b.بودجه_تقریبی_تومان].map(val => normalizeSearchString(String(val || ''))).join('|');

        setSellerEntries(prevSellers => {
            const existingSignatures = new Set(prevSellers.map(sellerSignature));
            const newUniqueSellers: SellerEntry[] = data.sellers.filter((seller: SellerEntry) => {
                const signature = sellerSignature(seller);
                if (existingSignatures.has(signature)) return false;
                existingSignatures.add(signature);
                return true;
            }).map((entry: any) => ({
                ...entry,
                id: generateUUID(),
                status: 'success',
                imageUrl: undefined,
                originalFile: undefined,
                اسم_ماشین: normalizeCarModelAdvanced(entry.اسم_ماشین, carModelNormalizationRules, dominantKeywords)
            }));
            const merged = [...prevSellers, ...newUniqueSellers];
            return merged.map((e, i) => ({ ...e, rowIndex: i + 1 }));
        });

        setBuyerEntries(prevBuyers => {
            const existingSignatures = new Set(prevBuyers.map(buyerSignature));
            const newUniqueBuyers: BuyerEntry[] = data.buyers.filter((buyer: BuyerEntry) => {
                const signature = buyerSignature(buyer);
                if (existingSignatures.has(signature)) return false;
                existingSignatures.add(signature);
                return true;
            }).map((entry: any) => ({
                ...entry,
                id: generateUUID(),
                status: 'success',
                imageUrl: undefined,
                originalFile: undefined,
                اسم_ماشین: normalizeCarModelAdvanced(entry.اسم_ماشین, carModelNormalizationRules, dominantKeywords)
            }));
            const merged = [...prevBuyers, ...newUniqueBuyers];
            return merged.map((e, i) => ({ ...e, rowIndex: i + 1 }));
        });

        if (data.normalizationRules && Array.isArray(data.normalizationRules)) {
            handleImportJsonRules(data.normalizationRules);
        }
        if (data.dominantKeywords && Array.isArray(data.dominantKeywords)) {
            setDominantKeywords(prevKeywords => Array.from(new Set([...prevKeywords, ...data.dominantKeywords])));
        }

        setSuggestionEntries([]);
        alert('جلسه با موفقیت از فایل JSON بارگذاری و با داده‌های فعلی ادغام شد. تصاویر مربوط به این جلسه بارگذاری نشده‌اند.');
    } catch (error) {
        console.error("Error loading and merging JSON session file:", error);
        alert(`خطا در بارگذاری فایل JSON: ${error instanceof Error ? error.message : 'فایل نامعتبر است.'}`);
    }
  };

  const handleLoadZipSession = async (file: File) => {
    try {
        const zip = await JSZip.loadAsync(file);
        const sessionFile = zip.file("session.json");
        if (!sessionFile) {
            throw new Error("فایل session.json در فایل ZIP یافت نشد.");
        }
        const jsonContent = await sessionFile.async("string");
        const data = JSON.parse(jsonContent);

        if (!data.version || !Array.isArray(data.sellers) || !Array.isArray(data.buyers)) {
            throw new Error("فرمت فایل session.json داخل ZIP نامعتبر است.");
        }

        // Robustly load all data files into a map first.
        const dataBlobsMap = new Map<string, Blob>();
        const dataFolderPrefix = 'data/';
        const imageFolderPrefix = 'images/'; // For backward compatibility

        const dataFiles = zip.filter((relativePath, file) => {
            return (relativePath.startsWith(dataFolderPrefix) || relativePath.startsWith(imageFolderPrefix)) && !file.dir;
        });

        const blobPromises = dataFiles.map(async (file) => {
            const blob = await file.async('blob');
            const id = file.name.startsWith(dataFolderPrefix)
                ? file.name.substring(dataFolderPrefix.length)
                : file.name.substring(imageFolderPrefix.length);

            if (id) {
                dataBlobsMap.set(id, blob);
            }
        });
        await Promise.all(blobPromises);

        const processEntries = async <T extends SellerEntry | BuyerEntry>(entries: T[]): Promise<T[]> => {
            const processedEntries: T[] = [];
            for (const entry of entries) {
                const newId = generateUUID();

                if (entry.id) {
                    const dataBlob = dataBlobsMap.get(entry.id);
                    if (dataBlob) {
                        await imageDB.saveImage(newId, dataBlob);
                    } else {
                        console.warn(`Data file not found in zip for original ID: ${entry.id} (Filename: ${entry.imageFileName})`);
                    }
                }

                processedEntries.push({
                    ...entry,
                    id: newId, // Assign the NEW ID to the entry
                    status: 'success',
                    imageUrl: undefined, // Let the ImageCell component load it from DB
                    originalFile: undefined,
                    اسم_ماشین: normalizeCarModelAdvanced(entry.اسم_ماشین, carModelNormalizationRules, dominantKeywords)
                });
            }
            return processedEntries;
        };

        const newSellers = await processEntries(data.sellers);
        const newBuyers = await processEntries(data.buyers);

        setSellerEntries(prev => [...prev, ...newSellers].map((e, i) => ({ ...e, rowIndex: i + 1 })));
        setBuyerEntries(prev => [...prev, ...newBuyers].map((e, i) => ({ ...e, rowIndex: i + 1 })));

        if (data.normalizationRules && Array.isArray(data.normalizationRules)) {
            handleImportJsonRules(data.normalizationRules);
        }
        if (data.dominantKeywords && Array.isArray(data.dominantKeywords)) {
            setDominantKeywords(prev => Array.from(new Set([...prev, ...data.dominantKeywords])));
        }

        setSuggestionEntries([]);
        alert('جلسه و داده‌ها (تصاویر و متون) با موفقیت از فایل ZIP بارگذاری و در حافظه مرورگر ذخیره شدند.');

    } catch (error) {
        console.error("Error loading and processing ZIP session file:", error);
        alert(`خطا در بارگذاری فایل ZIP: ${error instanceof Error ? error.message : 'فایل نامعتبر است.'}`);
    }
  };


  const handleLoadSessionFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      try {
          if (file.name.toLowerCase().endsWith('.zip')) {
              await handleLoadZipSession(file);
          } else if (file.name.toLowerCase().endsWith('.json')) {
              const fileContent = await file.text();
              await handleLoadJsonSession(fileContent);
          } else {
              alert("فرمت فایل پشتیبانی نمی‌شود. لطفاً یک فایل .zip یا .json انتخاب کنید.");
          }
      } catch (error) {
          console.error("Error handling session file:", error);
          alert("خطایی در هنگام پردازش فایل جلسه رخ داد.");
      } finally {
          if (loadSessionInputRef.current) {
              loadSessionInputRef.current.value = "";
          }
      }
  };


  const handleAddManualSeller = useCallback((data: Omit<SellerEntry, 'id' | 'rowIndex' | 'status' | 'imageFileName' | 'imageUrl' | 'originalFile' | 'errorMessage'>) => {
    const normalizedCarName = normalizeCarModelAdvanced(data.اسم_ماشین, carModelNormalizationRules, dominantKeywords);
    const newEntry: SellerEntry = {
      ...data,
      id: generateUUID(),
      rowIndex: 0,
      status: 'success',
      imageFileName: 'ورودی دستی',
      errorMessage: undefined,
      اسم_ماشین: normalizedCarName,
    };
    setSellerEntries(prev => [...prev, newEntry].map((e, idx) => ({ ...e, rowIndex: idx + 1 })));
    setShowManualSellerModal(false);
  }, [carModelNormalizationRules, dominantKeywords]);

  const handleAddManualBuyer = useCallback((data: Omit<BuyerEntry, 'id' | 'rowIndex' | 'status' | 'imageFileName' | 'imageUrl' | 'originalFile' | 'errorMessage'>) => {
    const normalizedCarName = normalizeCarModelAdvanced(data.اسم_ماشین, carModelNormalizationRules, dominantKeywords);
    const newEntry: BuyerEntry = {
      ...data,
      id: generateUUID(),
      rowIndex: 0,
      status: 'success',
      imageFileName: 'ورودی دستی',
      errorMessage: undefined,
      اسم_ماشین: normalizedCarName,
    };
    setBuyerEntries(prev => [...prev, newEntry].map((e, idx) => ({ ...e, rowIndex: idx + 1 })));
    setShowManualBuyerModal(false);
  }, [carModelNormalizationRules, dominantKeywords]);

  const handleExportToCSVSellers = () => {
    const successfulEntries = filteredSellerEntries.filter(e => e.status === 'success');
    if (successfulEntries.length === 0) {
      alert("هیچ داده موفقی با فیلتر فعلی در لیست فروشندگان برای خروجی گرفتن وجود ندارد.");
      return;
    }
    const headers = ["ردیف", "اسم ماشین", "سال ساخت", "رنگ", "کارکرد (کیلومتر)", "قیمت (تومان)", "اسم فروشنده", "نام فایل/منبع"];
    const csvRows = [
      headers.join(','),
      ...successfulEntries.map(entry => [
        escapeCsvCell(entry.rowIndex),
        escapeCsvCell(entry.اسم_ماشین),
        escapeCsvCell(toEnglishDigitsIfNeeded(entry.سال_ساخت)),
        escapeCsvCell(entry.رنگ),
        escapeCsvCell(toEnglishDigitsIfNeeded(entry.کارکرد_کیلومتر)),
        escapeCsvCell(toEnglishDigitsIfNeeded(entry.قیمت_تومان)),
        escapeCsvCell(entry.اسم_فروشنده),
        escapeCsvCell(entry.imageFileName || 'ورودی دستی'),
      ].join(','))
    ];
    const csvContent = "\uFEFF" + csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', 'car_seller_data_export.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportToCSVBuyers = () => {
    const successfulEntries = filteredBuyerEntries.filter(e => e.status === 'success');
    if (successfulEntries.length === 0) {
      alert("هیچ داده موفقی با فیلتر فعلی در لیست خریداران برای خروجی گرفتن وجود ندارد.");
      return;
    }
    const headers = ["اسم مشتری", "اسم ماشین", "سال ساخت", "رنگ", "بودجه تقریبی (تومان)", "توضیحات بیشتر", "وضعیت", "نام فایل تصویر/منبع"];
    const csvRows = [
      headers.join(','),
      ...successfulEntries.map(entry => [
        escapeCsvCell(entry.اسم_مشتری),
        escapeCsvCell(entry.اسم_ماشین),
        escapeCsvCell(toEnglishDigitsIfNeeded(entry.سال_ساخت)),
        escapeCsvCell(entry.رنگ),
        escapeCsvCell(toEnglishDigitsIfNeeded(entry.بودجه_تقریبی_تومان)),
        escapeCsvCell(entry.توضیحات_بیشتر),
        escapeCsvCell("خریدار"),
        escapeCsvCell(entry.imageFileName || 'ورودی دستی'),
      ].join(','))
    ];
    const csvContent = "\uFEFF" + csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', 'car_buyer_data_export.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleTextFileView = useCallback(async (entryId: string, fileName: string) => {
    try {
      const blob = await imageDB.getImage(entryId);
      if (blob && (blob.type.startsWith('text/'))) {
        const content = await blob.text();
        setTextModalInfo({ content, fileName });
        setIsTextModalOpen(true);
      } else {
        alert(`محتوای متنی برای فایل ${fileName} یافت نشد. ممکن است در پردازش اولیه مشکلی رخ داده باشد.`);
      }
    } catch (error) {
      console.error(`Error viewing text file for entry ${entryId}:`, error);
      alert('خطا در بارگذاری محتوای متنی.');
    }
  }, []);

  const closeTextModal = useCallback(() => {
      setIsTextModalOpen(false);
      setTextModalInfo(null);
  }, []);

  const handleViewRequest = useCallback(async (entryId: string, imageFileName: string) => {
    if (imageFileName.toLowerCase().endsWith('.txt')) {
      handleTextFileView(entryId, imageFileName);
      return;
    }

    // Logic for images
    const entry = sellerEntries.find(e => e.id === entryId) || buyerEntries.find(e => e.id === entryId);
    if (entry && entry.imageUrl && entry.status !== 'success') { // Placeholder URL is only reliable for non-success entries
      setEnlargedImageInfo({ url: entry.imageUrl, fileName: imageFileName, objectUrlToRevoke: undefined });
      setIsImageModalOpen(true);
      return;
    }

    try {
      const blob = await imageDB.getImage(entryId);
      if (blob) {
        const objectUrl = URL.createObjectURL(blob);
        setEnlargedImageInfo({ url: objectUrl, fileName: imageFileName, objectUrlToRevoke: objectUrl });
        setIsImageModalOpen(true);
      } else {
         alert("تصویر یافت نشد. ممکن است از پایگاه داده حذف شده باشد.");
      }
    } catch (error) {
      console.error(`Error enlarging image for entry ${entryId}:`, error);
      alert('خطا در بارگذاری تصویر.');
    }
  }, [sellerEntries, buyerEntries, handleTextFileView]);

  const closeImageModal = useCallback(() => {
    if (enlargedImageInfo?.objectUrlToRevoke) {
        URL.revokeObjectURL(enlargedImageInfo.objectUrlToRevoke);
    }
    setIsImageModalOpen(false);
    setEnlargedImageInfo(null);
  }, [enlargedImageInfo]);

  const handleGenerateSuggestions = useCallback(async () => {
    setIsGeneratingSuggestions(true);
    setSuggestionEntries([]);
    await new Promise(resolve => setTimeout(resolve, 50));

    try {
        const successfulSellers = sellerEntries.filter(s => s.status === 'success');
        const successfulBuyers = buyerEntries.filter(b => b.status === 'success');

        if(successfulBuyers.length === 0 || successfulSellers.length === 0) {
            alert("برای ایجاد پیشنهاد، باید حداقل یک فروشنده و یک خریدار با اطلاعات موفق در لیست‌ها وجود داشته باشد.");
            setIsGeneratingSuggestions(false);
            return;
        }
        const suggestions = generateAllSuggestions(
            successfulBuyers,
            successfulSellers,
            carModelNormalizationRules,
            dominantKeywords
        );
        setSuggestionEntries(suggestions);
    } catch (error) {
        console.error("Error generating suggestions:", error);
        alert("خطایی در هنگام تولید پیشنهادات رخ داد. لطفاً کنسول را برای جزئیات بررسی کنید.");
    } finally {
        setIsGeneratingSuggestions(false);
    }
  }, [sellerEntries, buyerEntries, carModelNormalizationRules, dominantKeywords]);

  const handleAddNormalizationRule = useCallback((targetName: string, firstAlias: string) => {
    if (!targetName.trim() || !firstAlias.trim()) {
        alert("نام اصلی گروه و حداقل یک نام مستعار الزامی است.");
        return;
    }
    const normalizedNewTargetName = normalizeRuleStringForComparison(targetName);
    const existingRuleWithSameTarget = carModelNormalizationRules.find(
        rule => normalizeRuleStringForComparison(rule.targetName) === normalizedNewTargetName
    );

    if (existingRuleWithSameTarget) {
        alert(`گروهی با نام اصلی "${targetName}" از قبل وجود دارد. لطفاً نام دیگری انتخاب کنید یا گروه موجود را ویرایش کنید.`);
        return;
    }

    const newRule: CarModelNormalizationRule = {
        id: generateUUID(),
        targetName: targetName.trim(),
        aliases: [firstAlias.trim()],
    };
    setCarModelNormalizationRules(prevRules => [...prevRules, newRule]);
  }, [carModelNormalizationRules]);

  const handleUpdateNormalizationRule = useCallback((ruleId: string, updatedRulePartial: Partial<CarModelNormalizationRule>) => {
    setCarModelNormalizationRules(prevRules =>
        prevRules.map(rule => {
            if (rule.id === ruleId) {
                const updatedTargetName = updatedRulePartial.targetName?.trim();
                const updatedAliases = updatedRulePartial.aliases?.map(a => a.trim()).filter(a => a);

                if (updatedTargetName && normalizeRuleStringForComparison(updatedTargetName) !== normalizeRuleStringForComparison(rule.targetName)) {
                    const conflictingRule = prevRules.find(
                        r => r.id !== ruleId && normalizeRuleStringForComparison(r.targetName) === normalizeRuleStringForComparison(updatedTargetName)
                    );
                    if (conflictingRule) {
                        alert(`گروه دیگری با نام اصلی "${updatedTargetName}" از قبل وجود دارد. لطفاً نام دیگری انتخاب کنید.`);
                        return rule;
                    }
                }

                return {
                    ...rule,
                    targetName: updatedTargetName || rule.targetName,
                    aliases: updatedAliases || rule.aliases
                };
            }
            return rule;
        })
    );
  }, []);

  const handleDeleteNormalizationRule = useCallback((ruleId: string) => {
    setCarModelNormalizationRules(prevRules => prevRules.filter(rule => rule.id !== ruleId));
  }, []);

  const handleImportJsonRules = useCallback((importedRulesData: Array<{ targetName: string; aliases: string[] }>) => {
    setCarModelNormalizationRules(prevRules => {
        const newRulesState = [...prevRules];

        importedRulesData.forEach(jsonRule => {
            const normalizedJsonTargetName = normalizeRuleStringForComparison(jsonRule.targetName);
            const existingRuleIndex = newRulesState.findIndex(
                r => normalizeRuleStringForComparison(r.targetName) === normalizedJsonTargetName
            );

            if (existingRuleIndex > -1) {
                const existingRule = newRulesState[existingRuleIndex];
                const currentAliasesNormalized = existingRule.aliases.map(normalizeRuleStringForComparison);
                const newUniqueAliases = jsonRule.aliases
                    .map(alias => alias.trim())
                    .filter(alias => alias && !currentAliasesNormalized.includes(normalizeRuleStringForComparison(alias)));

                if (newUniqueAliases.length > 0) {
                    newRulesState[existingRuleIndex] = {
                        ...existingRule,
                        aliases: [...existingRule.aliases, ...newUniqueAliases],
                    };
                }
            } else {
                newRulesState.push({
                    id: generateUUID(),
                    targetName: jsonRule.targetName.trim(),
                    aliases: [...new Set(jsonRule.aliases.map(a => a.trim()).filter(a => a))],
                });
            }
        });
        return newRulesState;
    });
  }, []);

  const handleAddDominantKeyword = useCallback((keyword: string) => {
    const trimmedKeyword = keyword.trim();
    if (!trimmedKeyword) {
        alert("کلمه کلیدی اصلی نمی‌تواند خالی باشد.");
        return;
    }
    const normalizedNewKeyword = normalizeRuleStringForComparison(trimmedKeyword);
    if (dominantKeywords.some(k => normalizeRuleStringForComparison(k) === normalizedNewKeyword)) {
        alert(`کلمه کلیدی "${trimmedKeyword}" از قبل در لیست کلمات کلیدی اصلی وجود دارد.`);
        return;
    }
    setDominantKeywords(prev => [...prev, trimmedKeyword]);
  }, [dominantKeywords]);

  const handleDeleteDominantKeyword = useCallback((keywordToDelete: string) => {
    setDominantKeywords(prev => prev.filter(k => k !== keywordToDelete));
  }, []);

  const handleSearchTermChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const normalizedQuery = normalizeSearchString(searchTerm);

  const filteredSellerEntries = sellerEntries.filter(entry => {
    if (!normalizedQuery) return true;
    const normalizedCarName = normalizeSearchString(entry.اسم_ماشین);
    const normalizedSellerName = normalizeSearchString(entry.اسم_فروشنده);
    const normalizedFileName = normalizeSearchString(entry.imageFileName);
    return normalizedCarName.includes(normalizedQuery) ||
           normalizedSellerName.includes(normalizedQuery) ||
           normalizedFileName.includes(normalizedQuery);
  });

  const filteredBuyerEntries = buyerEntries.filter(entry => {
    if (!normalizedQuery) return true;
    const normalizedCarName = normalizeSearchString(entry.اسم_ماشین);
    const normalizedCustomerName = normalizeSearchString(entry.اسم_مشتری);
    const normalizedFileName = normalizeSearchString(entry.imageFileName);
    return normalizedCarName.includes(normalizedQuery) ||
           normalizedCustomerName.includes(normalizedQuery) ||
           normalizedFileName.includes(normalizedQuery);
  });


  const apiKeyStatusColor = isAiServiceReady() ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700';

  return (
    <div className="container mx-auto p-4 min-h-screen flex flex-col" dir="rtl">
      <header className="py-6 text-center relative">
        <h1 className="text-4xl font-bold text-indigo-700">مدیریت هوشمند آگهی خودرو</h1>
        <p className="text-lg text-gray-600 mt-2">بارگذاری، تحلیل، دسته‌بندی و ارائه پیشنهادات هوشمند</p>
        <button
            onClick={() => setShowSettingsModal(true)}
            className="absolute top-4 left-4 p-2 bg-gray-200 hover:bg-gray-300 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
            aria-label="بازکردن تنظیمات"
            title="تنظیمات"
        >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-gray-700">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.646.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.43.992a6.759 6.759 0 0 1 0 1.905c-.008.379.137.75.43.99l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.6 6.6 0 0 1-.22.128c-.333.183-.582.495-.646.869l-.213 1.28c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.646-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613-.43.992a6.759 6.759 0 0 1 0-1.905c.008-.379-.137.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.646-.869l.213-1.28Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
        </button>
      </header>
       <div className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50 shadow-sm">
        <h2 className="text-xl font-semibold text-gray-700 mb-3">مدیریت جلسه</h2>
        <div className="flex flex-col sm:flex-row gap-4">
          <button
            onClick={handleSaveSession}
            className="px-6 py-2 bg-gray-700 text-white font-semibold rounded-lg shadow-md hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-75 transition duration-150 ease-in-out"
          >
            ذخیره جلسه (همراه با داده‌ها در فایل ZIP)
          </button>
          <input
            type="file"
            accept=".zip,.json"
            onChange={handleLoadSessionFile}
            className="hidden"
            ref={loadSessionInputRef}
          />
          <button
            onClick={() => loadSessionInputRef.current?.click()}
            className="px-6 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg shadow-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-75 transition duration-150 ease-in-out"
          >
            بارگذاری جلسه از فایل (ZIP یا JSON)...
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          داده‌های جلسه (لیست‌ها، قوانین، فایل‌های داده) را در یک فایل ZIP قابل حمل ذخیره کنید یا از فایل ZIP/JSON بارگذاری نمایید.
          <span className="font-semibold text-orange-600 block mt-1">
             توجه: بارگذاری فایل ZIP داده‌ها (تصاویر و متون) را در حافظه مرورگر ذخیره می‌کند تا در بازدیدهای بعدی نیز در دسترس باشند.
          </span>
        </p>
      </div>


      <main className="flex-grow bg-white p-6 shadow-xl rounded-lg">
        <div className="mb-4 border-b border-gray-200">
          <nav className="-mb-px flex space-x-4 space-x-reverse" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('sellers')}
              className={`whitespace-nowrap py-3 px-4 border-b-2 font-medium text-sm
                ${activeTab === 'sellers' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
            >
              لیست فروشندگان ({toPersianDigits(filteredSellerEntries.length)})
            </button>
            <button
              onClick={() => setActiveTab('buyers')}
              className={`whitespace-nowrap py-3 px-4 border-b-2 font-medium text-sm
                ${activeTab === 'buyers' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
            >
              لیست درخواست‌های خرید ({toPersianDigits(filteredBuyerEntries.length)})
            </button>
            <button
              onClick={() => setActiveTab('suggestions')}
              className={`whitespace-nowrap py-3 px-4 border-b-2 font-medium text-sm
                ${activeTab === 'suggestions' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
            >
              لیست پیشنهادات خودرو ({toPersianDigits(suggestionEntries.length)})
            </button>
          </nav>
        </div>

        <div className="space-y-2 mb-4">
            <p className={`text-sm p-3 border rounded-md ${apiKeyStatusColor}`}>{apiKeyStatus}</p>
            {aiProviderState === 'google-gemini' && isAiServiceReady() && (
                <div className="text-sm p-3 border rounded-md bg-blue-50 border-blue-200 text-blue-800">
                    <p>
                        <span className="font-semibold">کلید Gemini فعال:</span> شماره {toPersianDigits(currentApiKeyIndex + 1)}
                    </p>
                    <p>
                        <span className="font-semibold">تعداد فایل‌های پردازش شده با این کلید:</span> {toPersianDigits(imagesProcessedWithCurrentKey)} / {toPersianDigits(keyRotationThresholdState)}
                    </p>
                </div>
            )}
        </div>

        {activeTab !== 'suggestions' && (
          <div className="mb-4 p-4 border border-dashed border-gray-300 rounded-lg bg-gray-50">
            <h3 className="font-semibold text-lg text-gray-700 mb-2">وضعیت دریافت خودکار</h3>
            <p className="text-sm text-gray-600">{autoFetchStatus}</p>
          </div>
        )}


        {(isProcessingOverall) && activeTab !== 'suggestions' && (
            <div className="my-2 p-3 bg-blue-50 border border-blue-200 rounded-md text-center text-sm text-blue-700" aria-live="polite">
            {activeRequestCount > 0 && (
                <span>درحال ارسال <span className="font-semibold">{toPersianDigits(activeRequestCount)}</span> درخواست همزمان... </span>
            )}
            {fileQueue.length > 0 && (
                <span className="ml-2">فایل‌های در صف انتظار: <span className="font-semibold">{toPersianDigits(fileQueue.length)}</span></span>
            )}
            {activeRequestCount === 0 && fileQueue.length === 0 && isProcessingOverall && (
                 <span>لطفاً منتظر بمانید، آخرین پردازش‌ها در حال تکمیل است...</span>
            )}
            </div>
        )}

        {activeTab === 'sellers' && (
          <div>
            <div className="mt-6 mb-4 flex flex-col sm:flex-row gap-4">
                <button
                    onClick={handleExportToCSVSellers}
                    disabled={isProcessingOverall || filteredSellerEntries.filter(e => e.status === 'success').length === 0}
                    className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75 transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="خروجی CSV فروشندگان"
                >
                    خروجی CSV (فروشندگان)
                </button>
                <button
                    onClick={() => setShowManualSellerModal(true)}
                    disabled={isProcessingOverall}
                    className="px-6 py-3 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-75 transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="افزودن دستی فروشنده"
                >
                    افزودن دستی فروشنده
                </button>
            </div>
            <SellerCarDataTable
              data={filteredSellerEntries}
              onImageClick={handleViewRequest}
              deletionConfirmation={deletionConfirmation}
              onDeleteRequest={handleDeleteRequest}
              onConfirmDelete={handleConfirmDelete}
              onCancelDelete={handleCancelDelete}
              editingEntry={editingEntry?.type === 'seller' ? editingEntry : null}
              onEditRequest={handleEditRequest}
              onSaveEdit={handleSaveEdit}
              onCancelEdit={handleCancelEdit}
              onEditInputChange={handleEditInputChange}
            />
          </div>
        )}

        {activeTab === 'buyers' && (
          <div>
             <div className="mt-6 mb-4 flex flex-col sm:flex-row gap-4">
                <button
                    onClick={handleExportToCSVBuyers}
                    disabled={isProcessingOverall || filteredBuyerEntries.filter(e => e.status === 'success').length === 0}
                    className="px-6 py-3 bg-purple-600 text-white font-semibold rounded-lg shadow-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-75 transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="خروجی CSV خریداران"
                >
                    خروجی CSV (خریداران)
                </button>
                <button
                    onClick={() => setShowManualBuyerModal(true)}
                    disabled={isProcessingOverall}
                    className="px-6 py-3 bg-cyan-600 text-white font-semibold rounded-lg shadow-md hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-opacity-75 transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="افزودن دستی خریدار"
                >
                    افزودن دستی خریدار
                </button>
            </div>
            <BuyerRequestTable
              data={filteredBuyerEntries}
              onImageClick={handleViewRequest}
              deletionConfirmation={deletionConfirmation}
              onDeleteRequest={handleDeleteRequest}
              onConfirmDelete={handleConfirmDelete}
              onCancelDelete={handleCancelDelete}
              editingEntry={editingEntry?.type === 'buyer' ? editingEntry : null}
              onEditRequest={handleEditRequest}
              onSaveEdit={handleSaveEdit}
              onCancelEdit={handleCancelEdit}
              onEditInputChange={handleEditInputChange}
            />
          </div>
        )}

        {activeTab === 'suggestions' && (
          <div>
            <ModelNormalizationManager
                rules={carModelNormalizationRules}
                onAddRule={handleAddNormalizationRule}
                onUpdateRule={handleUpdateNormalizationRule}
                onDeleteRule={handleDeleteNormalizationRule}
                onImportJsonRules={handleImportJsonRules}
                dominantKeywords={dominantKeywords}
                onAddDominantKeyword={handleAddDominantKeyword}
                onDeleteDominantKeyword={handleDeleteDominantKeyword}
            />
            <div className="my-6 flex flex-col sm:flex-row items-center gap-4">
                <button
                    onClick={handleGenerateSuggestions}
                    disabled={isGeneratingSuggestions || isProcessingOverall || sellerEntries.filter(e=>e.status === 'success').length === 0 || buyerEntries.filter(e=>e.status === 'success').length === 0}
                    className="w-full sm:w-auto px-6 py-3 bg-teal-600 text-white font-semibold rounded-lg shadow-md hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-opacity-75 transition duration-150 ease-in-out flex items-center justify-center"
                    aria-label="ایجاد یا بروزرسانی پیشنهادات خودرو"
                >
                    {isGeneratingSuggestions ? (
                        <>
                            <Spinner size="w-5 h-5" color="text-white" />
                            <span className="mr-2">درحال تولید پیشنهادات...</span>
                        </>
                    ) : (
                        "ایجاد / بروزرسانی پیشنهادات هوشمند"
                    )}
                </button>
                 <p className="text-sm text-gray-600">
                    این عملیات ممکن است بر اساس تعداد فروشندگان و خریداران کمی زمان‌بر باشد. <br/>
                    تغییر در قوانین نرمال‌سازی ممکن است نیازمند ایجاد مجدد پیشنهادات باشد.
                </p>
            </div>
            <SuggestionListTable
                suggestions={suggestionEntries}
                isLoading={isGeneratingSuggestions}
                onImageClick={handleViewRequest}
            />
          </div>
        )}
      </main>

      <footer className="text-center py-8 text-sm text-gray-500">
        ساخته شده با ❤️ و هوش مصنوعی | &copy; {new Date().getFullYear()}
      </footer>

      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        currentAiProvider={aiProviderState}
        currentAvalaiApiKey={avalaiApiKeyState}
        currentGeminiApiKeys={geminiApiKeysState}
        currentModelId={selectedModelIdState}
        currentCustomModel={customApiModelState}
        currentConcurrency={maxConcurrentRequestsState}
        currentRequestInterval={requestIntervalState}
        currentBatchSize={batchSizeState}
        currentImageOptimizationSettings={imageOptimizationSettingsState}
        currentKeyRotationThreshold={keyRotationThresholdState}
        onSave={handleSaveSettings}
        onClearAllData={handleClearAllStoredData}
      />
      <ImageModal
        isOpen={isImageModalOpen}
        imageInfo={enlargedImageInfo}
        onClose={closeImageModal}
      />
      <TextModal
        isOpen={isTextModalOpen}
        textInfo={textModalInfo}
        onClose={closeTextModal}
      />
      <ManualSellerEntryModal
        isOpen={showManualSellerModal}
        onClose={() => setShowManualSellerModal(false)}
        onSave={handleAddManualSeller}
      />
      <ManualBuyerEntryModal
        isOpen={showManualBuyerModal}
        onClose={() => setShowManualBuyerModal(false)}
        onSave={handleAddManualBuyer}
      />
    </div>
  );
};

export default App;
