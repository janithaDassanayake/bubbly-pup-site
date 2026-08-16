# Reporting & Analytics Module – Tasks

## Objective

Improve the **Reporting section** of the admin portal so that it provides a clear, modern, and easy-to-read overview of appointment performance, customer types, and revenue. The reporting page should allow the admin to quickly view data for **Today, This Week, This Month, or a Custom Date Range**.

## Date Filters

The Reporting page should include quick filter buttons for:

* **Today** – show data for the current date.
* **This Week** – show data for the current week.
* **This Month** – show data for the current month.
* **Custom Range** – open a calendar/date-range picker where the admin can select:

  * **From Date**
  * **To Date**

The custom calendar must support selecting a **date range**, not only a single date.

Example:

**From:** 01 August 2026
**To:** 15 August 2026

After selecting the range, all statistics, charts, and reports on the page must automatically update according to the selected period.

---

## Summary Statistics

For the selected date period, display clear summary cards showing:

1. **Total Appointments**

   * Total number of appointments received.

2. **Total Revenue**

   * Total revenue generated from all completed/paid appointments.

3. **Online Appointments**

   * Number of customers who booked through the online booking system.

4. **Walk-In Appointments**

   * Number of walk-in/manual customers added by the salon/admin.

5. **Online Revenue**

   * Total revenue generated from online appointments.

6. **Walk-In Revenue**

   * Total revenue generated from walk-in appointments.

The cards should be visually clean and make the important numbers easy to understand at a glance.

---

## Charts & Visual Reports

Add graphical reports so the admin can easily understand business performance.

### 1. Revenue Trend

Add a **line chart or area chart** showing revenue over the selected period.

For example:

* Daily revenue when viewing Today/Week
* Daily or weekly revenue when viewing Month
* Revenue according to the selected custom period

### 2. Appointment Trend

Add a chart showing the number of appointments received over time.

The chart should make it easy to identify busy and quiet days.

### 3. Online vs Walk-In Customers

Add a **bar chart or donut chart** comparing:

* Online appointments
* Walk-in appointments

### 4. Online vs Walk-In Revenue

Add another visual comparison showing:

* Revenue from online appointments
* Revenue from walk-in appointments

---

## Suggested Reporting Page Layout

The page can be organized approximately like this:

```text
---------------------------------------------------------
 Reporting & Analytics
 View your appointment and revenue performance
---------------------------------------------------------

 [ Today ] [ This Week ] [ This Month ] [ Custom Range ]

 Custom Range:
 [ From Date ] → [ To Date ]       [ Apply ]

---------------------------------------------------------

 [ Total Appointments ]  [ Total Revenue ]
 [ Online Customers ]    [ Walk-In Customers ]
 [ Online Revenue ]      [ Walk-In Revenue ]

---------------------------------------------------------

 Revenue Overview
 [ Revenue Line / Area Chart ]

---------------------------------------------------------

 Appointment Overview
 [ Appointment Trend Chart ]

---------------------------------------------------------

 Online vs Walk-In
 [ Appointment Chart ]   [ Revenue Chart ]

---------------------------------------------------------
```

## Functional Requirements

* [x] Default the Reporting page to **Today** when it is opened.
* [x] Add **Today** filter.
* [x] Add **This Week** filter.
* [x] Add **This Month** filter.
* [x] Add **Custom Date Range** filter.
* [x] Allow users to select both a **start date and end date** from the calendar.
* [x] Refresh the complete report whenever the selected period changes.
* [x] Calculate total appointments for the selected period.
* [x] Calculate total revenue for the selected period.
* [x] Calculate number of online appointments.
* [x] Calculate number of walk-in appointments.
* [x] Calculate revenue generated from online appointments.
* [x] Calculate revenue generated from walk-in appointments.
* [x] Add revenue trend chart.
* [x] Add appointment trend chart.
* [x] Add Online vs Walk-In appointment chart.
* [x] Add Online vs Walk-In revenue chart.
* [x] Ensure charts also respond to the selected date filter.
* [x] Make the Reporting page responsive for desktop, tablet, and mobile.
* [x] Keep the UI clean, modern, spacious, and easy to read.

## Important Data Rule

Every appointment should have a clear source/type such as:

```text
ONLINE
WALK_IN
```

This field should be used when calculating customer counts and revenue.

For example:

```text
Online Revenue =
SUM(finalPrice of appointments where source = ONLINE)

Walk-In Revenue =
SUM(finalPrice of appointments where source = WALK_IN)
```

Use the **final appointment amount actually charged to the customer** when calculating revenue, including any manual price adjustments, discounts, or additional services.

## Expected Result

The admin should be able to open the Reporting page and immediately understand:

**How many appointments were received, how much money was earned, where the customers came from, and how the business performed during any selected time period.**

The page should feel like a simple **business analytics dashboard**, rather than just a table of appointments.
