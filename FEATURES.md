# Features of URY App

It's important to note that if no POS Opening entry is created for the day, URY will not allow table selection, ensuring accurate tracking of operations.
A POS Closing Entry must be created at the end of each day to complete the daily operations.

> :information_source: **Note**  
> This version is currently designed for **POS machines/Desktop** to handle **cashiers and fast checkout**.  
> For **order takers and mobile support**, use **Version 1 POS**, which is available at the path `/urypos/Table`.

- **Key Features**
	- All Major POS Features from Version 1 Retained
	- Core functionalities from the previous version are preserved for consistency.

- **Unified Order-Taking Interface**
	- A single page handles the entire order flow—streamlining operations and reducing clicks.

- **Dynamic Header Search Bar**
	- In POS Page: Search for menu items.
	- In Order Page: Search by customer name, invoice ID, etc.

- **Table Selection for Dine-In Orders**
	- Tables are displayed using shapes and colors.
	- Shapes are configurable via the URY Table Doctype.

- **Menu Item Interactions**
	- Double Click: Opens detailed product page for customizations.
	- Single Click: Instantly adds item to cart.

- **Sidebar Menu Course Navigation**
	- A left sidebar on the POS page allows quick switching between menu courses (e.g., Starters, Mains, Desserts).

### Version 1

- **Room Selection**
	
	-  To view tables in each room of the restaurant and select their preferred room.

- **Table Selection**

	- URY POS table order taking workflow begins with table selection.
	- Tables are visually represented as cards, providing flexibility in the selection process
	- On the top left side of table have badges that indicated table status:
		- Attention(Red): Indicates the table occupied for more than Table Attention time in POS Profile.
		- Occupied(Yellow): Indicates occupied tables.
		- Free(Green):Signifies available tables
		- Active(Blue): Highlights the currently selected table.
	- Occupied table propeties
		- On the top right of table has button that contains a drop down for table and captain transfer
			- Table Transfer : Transfer an order from one table to another after placing the initial order. Clear the original table, and occupy the new table.
			- Captain Transfer : Enables the transfer of an order from one captain to another after placing an order at a table.
		- `Bill` button to generate a bill against the order, clearing the table.
		- `Eye icon` button for navigate to the order page     
		- Table time is displayed within each card
		- On selecting a table with an existing order, will automatically navigate to the menu page.

- **Menu Selection**

	- Search bar to quickly locate specific menu items, enhancing speed and accuracy during busy periods.
	- Toggle visibility of menu item image based on "View Item Image" checkbox in POS profile.
	- Menu filtering with a select box for selecting courses from the restaurant menu , which displays the available courses.
	- Menu filtering with Button All - Display all menu item. Priority - displays only prioritized items.
	- Menus are presented in a card format which includes the menu name, selected quantity of the item , and +/- buttons for adjusting quantities.
	- For precise quantity adjustments, users can click on the quantity display, triggering a dialogue box for easy modification and item wise comments.

- **Customer Selection**
	
	- Option to create a customer using the customer's name and mobile number. You can also add the Customer Group and Territory if needed.
	- Option to search for an existing customer using the name or mobile number.
	- Option to enter number of pax.
	- For returning customers, URY POS displays their top three ordered items in Favourite item section.

- **Cart**

	- Displays ordered items and their quantities.
	- Users can click on the quantity to open a dialog box for precise adjustments and add item-wise comments.
	- Includes a delete button to remove items from the cart.
	- Shows the grand total.
	- Option to add a general comment to the order.
	- Displays additional details such as invoice number, waiter name, POS profile, and cashier.
	- Action Buttons in Cart,
		- *Update* : Used to generate an order, ie. creating a POS invoice in draft status.
		- *Cancel* : To cancel order (draft invoice) and clear the table.
		- *KOT Reprint* : Used to reprint KOT.

- **Takeaway Order Taking** 

	- Takeaway orders can be placed by selecting the `Order Type` on the table page, choosing menu items, adding customer details, and clicking the Update button. This will redirect to the `OrderLog` page.
	- Option to search recent orders using invoice ID,customer name and mobile number.
	- The Order Log page displays recently placed invoices based on their status:
		- `Draft`: Shows takeaway orders and billed table orders.
		- `Unbilled`: Displays unbilled table orders.
		- `Recently Paid`: Displays a limited number of recently paid invoices, based on the limit set in the POS Profile.
		- `Paid`, `Consollidated` and `Return` : Show all paid, consolidated, and returned orders based on the selected order type. These statuses are visible only if the `Allow Cashier to View All Status` checkbox is enabled in the POS Profile.
	- `Edit`: Used to modify recent orders.
	- `Print Receipt`: To print the invoice.
	- `Make Payment`: Allows settling the invoice by selecting a mode of payment.
	- `Cancel Order`: To cancel order.

- **Order Printing**

	- URY facilitates room-wise printing and offers three distinct methods for executing printing.
		- QZ printing
			- You may need first install [QZ Tray](https://qz.io/download/) if is not already on your system
			- To setup [QZ](https://qz.io/docs/print-server) , 
				POS Profile List > POS Profile > QZ Print > QZ Host to enable QZ printing.
			- If there are multiple devices for printing , Private IP of the machine hosting the QZ server is given as 'QZ Host'
			- Otherwise, use 'localhost' or 127.0.0.1 in the 'QZ Host' data field.
		- Network Printing
			- Network printing is an alternative option, which functions when QZ printing is in a disabled state.
			- To setup it 
				POS Profile List > POS Profile > Printer Settings
			- At the table, tsetting for the printer name is provided with the checkbox 'Bill' set to true.
			- The printer name correspond to printer configured in [Network Printer Settings](https://docs.erpnext.com/docs/user/manual/en/print-settings#3-network-printer-print-server) in ERPnext.
		- Websocket Printing
			- If Either of QZ and Network Printing are not configured , URY will call  websocket printing.
			- Page can be accessed in `/app/websocket-print` in your browser


**MOSAIC (Kitchen Order Ticket)**

- **KOT Generation:**
	- KOT are generated when order is placed in the system
	- Update button in order taking and checkout in POS will trigger initial KOT

- **Modified KOT:**
	- Adding new item / quantity to the existing order will generate a modified KOT 
  
- **Partially cancelled KOT:**
	- Removing an Item / reducing quantity from existing order  will generate a Partially cancelled KOT.
 
- **Cancelled KOT:**
	- Created when an entire order is cancelled .
  
- **KOT Comments**
	- Can attach item-wise and order-level comments to KOTs, visible in the Kitchen Display System (KDS)
  
- **Production Units** 
	- Production units are used to rule multiple kitchens.
	- Each production unit has its own dedicated web-based interface, displaying specific items.
	- Printers can be configured separately for each production unit.
	- KDS displays are organised by these units , access KDS via 
		`/URYMosaic/<URY_Production_Unit>`   
    
- **KOT Display**
	- KDS make easy to monitor kitchen orders (KOTs) on a screen..
	- Receive real-time updates for new KOTs and table changes.
	- KOTs are displayed as cards with the following details ,
		- Order Type (Table or Takeaway).
		- Table name for table orders.
		- User who placed the order
		- POS Invoice ID as Order ID.
		- KOT Created Time 
		- Item name , quantity and item wise comments.
		- Order-level comments.
	- Display available quantity and old quantity for canceled orders. 
	- Ability to mark items as served and unserved.
	- Timer against KOT are set in "KOT Warning Time" field within the POS profile to trigger a warning when it's exceeded. 
	- Can Enable "Notify KOT Delay" for KOT delay notification feature in the POS profile and add recipients roles to the Recipients table.
	- Can Enable 'KOT Audio Alert' to play a sound when a KOT is displayed. You can add an audio alert in the 'KOT alert sound' attachment field
	- For Cancelled order , card display available quantity and old quantity.
	- Clicking outside the items section on a KOT card reveals two buttons:
		- "Serve"  : Remove Card from the KDS and mark Serve time in KOT document.
		- "Confirm" (only for canceled KOTs): Confirms the cancellation..
		- Clicking on the card again returns to the original view.
	- KOTs are color-coded for easy identification:
		- White : New KOT for table orders
		- Blue : New KOT for takeaway orders
		- Orange : Modified KOT orders
		- Red : Cancelled or partially cancelled KOT orders

- **KOT Print**
	- Generate physical copies of KOTs
	- KOT Prints are generated when order are placed
	- Configure printers through network printing in POS profiles for global printing 
	- To print KOT in the production unit and room, you need to configure the printer separately for each location.

**Daily Profit and Loss:**

- **Daily Profit and Loss report. Here's how it works:**

	- Buying Price List :
		- Users can set the buying price list to calculate the cost of goods.

	- Direct Expenses :
		- This section includes expenses such as consumables (burning materials), their cost per unit, and direct fixed expenses (daily fixed expenses). You can set expense names and amounts for items that are part of your daily operational costs.
  
	- Indirect Expenses :
		-  Indirect expenses consist of electricity costs per unit, expense names, and amounts that are also daily fixed expenses. Additionally, there's a section for percentage expenses, which allows you to store expense percentages based on either net sales or gross sales. You can also set depreciation in this section.

- **Daily P and L Calculation:**

	***Once you've set up the necessary data in the Daily Profit and Loss section of URY Report Settings, the system can calculate your daily profit and loss, including the following components:***

	- Gross Sales: The total sales for the day..
	- Direct Expenses: The sum of consumables and other direct fixed expenses.
	- Cost of Goods Sold: This includes the cost of the items sold, factoring in product bundles and Bill of Materials (BOM) sub-items. 
	- Gross Profit/Loss: The difference between gross sales and the cost of goods sold.
	- Employee Cost: The total Employee Cost for the day, including wages, salaries, benefits, and any other related expenses. This cost is part of the Total Indirect Expense.
	- Indirect Expenses: The total of indirect fixed expenses and any percentage-based expenses.
	- Net Profit/Loss: The final profit or loss for the day.
 
	***By inputting daily readings for consumables, electricity, and any other expenses, and then saving and submitting the document, you can generate a detailed daily profit and loss report, complete with a breakdown of the cost of goods sold. This report is an invaluable tool for restaurant owners and managers to track their financial performance on a daily basis.***

- **Reports:** 

	***It offers a wide range of reports, including the following:***

	1. Today's Sales
	2. Daywise Sales
	3. Daywise Invoices
	4. Month Wise Sales
	5. Average Bill Value
	6. Cancelled Invoices
	7. Item Wise Sales
	8. Customer Data
	9. Repeated Customers
	10. Daywise Customer Details
	11. Employee Sales
	12. Employee Item Wise Sales
	13. Service Wise Sales
	14. Time Wise Sales
  
- **Customizable Branch Timings:**
	- URY allows you to set varying branch timings in the URY Report settings, including extended hours. This feature ensures that your reports accurately reflect the operational hours of your restaurant.
