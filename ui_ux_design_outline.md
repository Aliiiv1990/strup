# Outline: Conceptual UI/UX Design for WhatsApp Platform Web Interface

This document outlines the conceptual design for a simple web interface for the WhatsApp Platform. It serves as a blueprint for frontend development, detailing the required UI elements, views, and user flow.

## General UI/UX Principles

*   **Clean and Intuitive Design:** The interface should be uncluttered, easy to understand, and straightforward to navigate, even for users with minimal technical expertise.
*   **Clear Calls to Action (CTAs):** Buttons and interactive elements should be clearly labeled and prominently displayed to guide users through tasks.
*   **Responsive Design:** While the initial implementation might focus on desktop, the design should ideally be responsive to work effectively on various screen sizes (tablets, mobile devices).
*   **User Feedback:** The system should provide immediate and clear feedback for user actions (e.g., success messages after saving data, error notifications if something goes wrong, loading indicators for longer operations).
*   **Consistency:** Maintain a consistent layout, terminology, and design patterns across all views to enhance usability.

## 1. Overall Layout & Navigation

*   **Navigation Structure:**
    *   A persistent **sidebar navigation** is proposed for main sections. This allows for easy access to all key areas of the application.
    *   The top bar could display the logged-in user's information and a logout button.
*   **Main Navigation Items (Sidebar):**
    *   **داشبورد (Dashboard):** Overview and quick stats.
    *   **مخاطبین (Contacts):** Manage contacts and contact lists.
    *   **ارسال‌های گروهی (Broadcasts):** Schedule and manage broadcast messages.
    *   **قوانین چت‌بات (Chatbot Rules):** Manage basic chatbot response rules.
    *   **تحلیل‌ها (Analytics):** View message statistics and insights.
    *   **(Settings/تنظیمات - Future Scope):** For API keys, user management, etc.

## 2. Dashboard View

*   **Purpose:** Provide a quick, at-a-glance overview of key metrics and activities, enabling users to quickly assess system status and common tasks.
*   **Components:**
    *   **Summary Statistics (KPI Cards):**
        *   "تعداد کل مخاطبین" (Total Contacts)
        *   "ارسال‌های زمان‌بندی شده امروز" (Scheduled Broadcasts Today)
        *   "پیام‌های دریافتی امروز" (Messages Received Today)
        *   "پیام‌های ارسال شده (۲۴ ساعت گذشته)" (Messages Sent - Last 24h)
    *   **Quick Actions:**
        *   Button: "+ ارسال گروهی جدید" (Schedule New Broadcast) - links to the broadcast scheduling form.
        *   Button: "+ افزودن مخاطب جدید" (Add New Contact) - links to a contact creation form/modal.
    *   **Message Trends (Placeholder for Chart):**
        *   A simple line chart visualization (placeholder initially, can be implemented later) showing:
            *   "روند پیام‌های ارسالی و دریافتی (۷ روز گذشته)" (Sent vs. Received Messages Trend - Last 7 Days).
    *   **Recent Activity (Optional):**
        *   A small list/feed showing the last 3-5 activities, e.g., "Broadcast 'تخفیف بهاری' sent to 'مشتریان ویژه'", "Rule 'سلام' triggered".

## 3. Contacts Management View

*   **Purpose:** Allow users to create, view, edit, and delete contacts and organize them into lists for targeted messaging.
*   **Sub-views/Components:**

    *   **A. Contact Lists Tab/View:**
        *   **Contact List Table:**
            *   **Columns:**
                *   `نام لیست` (List Name)
                *   `تعداد مخاطبین` (Number of Contacts)
                *   `تاریخ ایجاد` (Date Created)
                *   `عملیات` (Actions):
                    *   Button: "مشاهده/ویرایش مخاطبین" (View/Edit Contacts) - Navigates to view B.
                    *   Button: "ویرایش نام لیست" (Edit List Name)
                    *   Button: "حذف لیست" (Delete List) - with confirmation.
        *   **Overall Actions:**
            *   Button: "+ ایجاد لیست مخاطبین جدید" (Create New Contact List) - Opens a modal or form to name the new list.

    *   **B. Contacts within a Specific List View (Opened after clicking "View/Edit Contacts" from table A):**
        *   **Header:** Displaying "مخاطبین لیست: [نام لیست]" (Contacts in List: [List Name]).
        *   **Contact Table:**
            *   **Columns:**
                *   `نام مخاطب` (Contact Name)
                *   `شناسه واتساپ (ID)` (WhatsApp ID)
                *   `فیلدهای سفارشی` (Custom Fields - displayed concisely, e.g., "شهر: تهران")
                *   `تاریخ افزودن` (Date Added to List)
                *   `عملیات` (Actions):
                    *   Button: "ویرایش مخاطب" (Edit Contact) - Opens form C.
                    *   Button: "حذف از لیست" (Remove from List) - with confirmation.
        *   **Overall Actions for this List:**
            *   Button: "+ افزودن مخاطب جدید به این لیست" (Add New Contact to This List) - Opens form C, pre-selected for this list.
            *   (Optional) Button: "ایمپورت مخاطبین" (Import Contacts - e.g., from CSV).
            *   (Optional) Button: "اکسپورت مخاطبین" (Export Contacts - e.g., to CSV).

    *   **C. Contact Creation/Edit Form (Modal or Separate Page):**
        *   **Fields:**
            *   Input: `نام مخاطب` (Contact Name) - Required.
            *   Input: `شناسه واتساپ (ID)` (WhatsApp ID - Phone Number) - Required, with validation for phone number format.
            *   Text Area / Key-Value Input: `فیلدهای سفارشی` (Custom Fields) - Allow users to add custom data as key-value pairs (e.g., `key: شهر, value: تهران`). JSON input is also an option for advanced users but key-value is more user-friendly.
            *   (If editing an existing contact) Display: `عضو لیست‌های` (Member of Lists) - with option to add/remove from other lists.
        *   **Actions:**
            *   Button: "ذخیره مخاطب" (Save Contact).
            *   Button: "انصراف" (Cancel).

## 4. Broadcasts Management View

*   **Purpose:** Allow users to schedule new broadcast messages, view the status of scheduled/sent broadcasts, and manage existing ones.
*   **Sub-views/Components:**

    *   **A. Scheduled Broadcasts Table:**
        *   **Filters (Optional):** Filter by Status, Date Range.
        *   **Columns:**
            *   `محتوای پیام` (Message Content - snippet or name of the MessageContent used)
            *   `لیست(های) هدف` (Target List(s) - name of the contact list(s))
            *   `زمان ارسال` (Scheduled Time)
            *   `وضعیت` (Status - e.g., "در انتظار", "در حال ارسال", "ارسال موفق", "ناموفق", "لغو شده" - Pending, Processing, Sent, Failed, Cancelled)
            *   `تعداد ارسال موفق/ناموفق` (Sent/Failed Count - e.g., 95/100)
            *   `عملیات` (Actions):
                *   Button: "مشاهده جزئیات" (View Details - show full message, target lists, individual recipient statuses if available).
                *   Button: "ویرایش" (Edit - if status is 'Pending').
                *   Button: "حذف" (Delete - if status is 'Pending', otherwise 'Cancel Send').
                *   Button: "کپی کردن" (Duplicate/Clone - to create a new broadcast based on this one).
        *   **Overall Actions:**
            *   Button: "+ ارسال گروهی جدید" (Schedule New Broadcast) - Opens form B.

    *   **B. Broadcast Scheduling Form (Modal or Separate Page):**
        *   **Fields:**
            *   Dropdown: "انتخاب محتوای پیام" (Select MessageContent) - Populated from predefined `MessageContent` entries.
                *   Link/Button: "+ ایجاد محتوای پیام جدید" (Create New MessageContent) - Opens a simple form/modal with fields for `نام محتوا` (Content Name) and `متن پیام` (Message Body - textarea). Allow placeholders like `{{name}}`, `{{custom_field_name}}`.
            *   Multi-Select Dropdown/Checkboxes: "انتخاب لیست(های) مخاطبین" (Select Contact List(s)).
            *   Date/Time Picker: "زمانبندی ارسال" (Schedule Time) - For `scheduled_time`.
            *   (Optional) Text Area / Key-Value Input: "مقادیر شخصی‌سازی کمپین" (Campaign Personalization Placeholders) - For campaign-level placeholders like `{{broadcast_campaign_code}}`.
            *   (Optional) Input: "نام این ارسال گروهی" (Broadcast Name - for internal tracking).
        *   **Actions:**
            *   Button: "زمان‌بندی ارسال" (Schedule Broadcast).
            *   Button: "ذخیره به عنوان پیش‌نویس" (Save as Draft - Future Scope).
            *   Button: "انصراف" (Cancel).

## 5. Chatbot Rules Management View (Basic)

*   **Purpose:** Allow users to view, create, edit, and delete simple keyword-based chatbot response rules.
*   **Components:**

    *   **A. Rules Table:**
        *   **Columns:**
            *   `نام قانون` (Rule Name)
            *   `کلمات کلیدی` (Keywords - displayed comma-separated or as tags)
            *   `متن پاسخ` (Response Text - snippet)
            *   `نوع تطابق` (Match Type - e.g., "هر کلمه کلیدی", "عبارت دقیق" - Any Keyword, Exact Phrase)
            *   `فعال/غیرفعال` (Status - Active/Inactive Toggle)
            *   `عملیات` (Actions):
                *   Button: "ویرایش" (Edit) - Opens form B.
                *   Button: "حذف" (Delete) - with confirmation.
        *   **Overall Actions:**
            *   Button: "+ ایجاد قانون جدید" (Create New Rule) - Opens form B.

    *   **B. Rule Creation/Edit Form (Modal or Separate Page):**
        *   **Fields:**
            *   Input: `نام قانون` (Rule Name) - Required.
            *   Text Area or Tag Input: `کلمات کلیدی` (Keywords) - User can enter multiple keywords.
            *   Text Area: `متن پاسخ` (Response Text).
            *   Dropdown: `نوع تطابق` (Match Type) - Options: "هر کلمه کلیدی" (Any Keyword), "عبارت دقیق" (Exact Phrase - Future Scope for basic rules).
            *   Checkbox/Toggle: `فعال کردن قانون` (Enable Rule).
        *   **Actions:**
            *   Button: "ذخیره قانون" (Save Rule).
            *   Button: "انصراف" (Cancel).

## 6. Analytics View

*   **Purpose:** Display insights and statistics derived from message data, based on `AnalyticsService` capabilities.
*   **Components:**
    *   **Date Range Selectors:**
        *   Input fields for "از تاریخ" (Start Date) and "تا تاریخ" (End Date).
        *   Predefined ranges (e.g., "هفته گذشته", "ماه گذشته" - Last Week, Last Month).
        *   Button: "اعمال فیلتر" (Apply Filter).
    *   **Message Counts Display:**
        *   Card/Section: "آمار کلی پیام‌ها" (Overall Message Statistics).
            *   `تعداد پیام‌های ارسالی:` (Number of Sent Messages): [Value]
            *   `تعداد پیام‌های دریافتی:` (Number of Received Messages): [Value]
            *   `مجموع کل پیام‌ها:` (Total Messages): [Value]
    *   **Common Keywords Display:**
        *   Section: "کلمات کلیدی پرتکرار (در پیام‌های دریافتی)" (Common Keywords - Incoming Messages).
        *   Table or List:
            *   `کلمه کلیدی` (Keyword) | `تکرار` (Frequency)
        *   (Optional) Filter by Incoming/Outgoing messages.
    *   **Sentiment Overview Display:**
        *   Section: "تحلیل احساسات کلی پیام‌های دریافتی (شبیه‌سازی شده)" (Overall Sentiment Analysis - Incoming, Simulated).
        *   Simple Table or Placeholder for Pie Chart:
            *   `مثبت:` (Positive): [Count / Percentage]
            *   `منفی:` (Negative): [Count / Percentage]
            *   `خنثی:` (Neutral): [Count / Percentage]
        *   (Optional) Filter by Incoming/Outgoing messages.

This outline provides a foundational structure. Each view and component would require further detailed design during the actual UI/UX development phase, including specific layouts, component styling, and interaction details.
