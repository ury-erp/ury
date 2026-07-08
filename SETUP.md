## URY Setup 

This guide takes you step-by-step through setting up URY on top of ERPNext

### Step 1 : Company

- Login into the site and Follow the installation wizard 
	- Specify the language.
	- Provide country , timezone and currency details.
	- Create the first user.
	- Enter company name, its description, and select a bank account.
	- click on 'Complete setup'
	
### Step 2 : Users and Roles

- To manage restaurant operations in URY, you’ll need to set up specific user roles in the ERPNext/Frappe system. Use the [Frappe/ERPNext interface](https://docs.erpnext.com/docs/user/manual/en/adding-users) to create a new user. 

- Assign one of the three URY roles to users:
	- URY Manager - Responsible for overseeing and managing all restaurant operations.
	- URY Captain - Responsible for managing customer orders and table service.
	- URY Cashier - Responsible for managing customer orders, table service, and handling payments and POS operations.

- Below are the recommended DocType permissions for URY roles. These permissions cover only the basic restaurant operations needed for URY (such as table service, billing, and order handling). You can extend or modify them later based on your restaurant’s workflow and access needs.
	<details>
	  <summary>View Role Permissions</summary>
	
	| Role | Doctype | Perm | Select | Read | Write | Create | Delete | Submit | Cancel | Amend | Print | Email | Report | Import | Export | Share |
	| :---- | :---- | :---- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
	| **URY Captian** | Company | 0 | ✓ | ✓ | - | - | - | - | - | - | - | - | - | - | - | - |
	| | Currency | 0 | ✓ | ✓ | - | - | - | - | - | - | - | - | - | - | - | - |
	| | Customer | 0 | ✓ | ✓ | ✓ | ✓ | - | - | - | - | - | - | - | - | - | - |
	| | Item Price | 0 | ✓ | ✓ | - | - | - | - | - | - | - | - | - | - | - | - |
	| | POS Invoice | 0 | ✓ | ✓ | ✓ | ✓ | - | - | - | - | ✓ | - | - | - | - | - |
	| | POS Opening | 0 | ✓ | ✓ | - | - | - | - | - | - | - | - | - | - | - | - |
	| | URY KOT | 0 | ✓ | ✓ | ✓ | ✓ | - | ✓ | ✓ | - | - | - | - | - | - | - |
	| | URY KOT Error Log | 0 | ✓ | ✓ | ✓ | ✓ | - | - | - | - | - | - | - | - | - | - |
	| **URY Cashier** | Company | 0 | ✓ | ✓ | - | - | - | - | - | - | - | - | - | - | - | - |
	| | Currency | 0 | ✓ | ✓ | - | - | - | - | - | - | - | - | - | - | - | - |
	| | Customer | 0 | ✓ | ✓ | ✓ | ✓ | - | - | - | - | - | - | - | - | - | - |
	| | Item Price | 0 | ✓ | ✓ | - | - | - | - | - | - | - | - | - | - | - | - |
	| | POS Profile | 0 | ✓ | ✓ | - | - | - | - | - | - | - | - | - | - | - | - |
	| | POS Invoice | 0 | ✓ | ✓ | ✓ | ✓ | - | ✓ | ✓ | - | - | - | - | - | - | - |
	| | POS Opening | 0 | ✓ | ✓ | ✓ | ✓ | - | ✓ | - | - | - | - | - | - | - | - |
	| | POS Closing | 0 | ✓ | ✓ | ✓ | ✓ | - | ✓ | - | - | - | - | - | - | - | - |
	| | Sales Invoice | 0 | ✓ | ✓ | ✓ | ✓ | - | ✓ | - | - | - | - | - | - | - | - |
	| | User | 0 | ✓ | ✓ | - | - | - | - | - | - | - | - | - | - | - | - |
	| | User | 1 | - | ✓ | ✓ | - | - | - | - | - | - | - | - | - | - | - |
	| | URY KOT | 0 | ✓ | ✓ | ✓ | ✓ | - | ✓ | ✓ | - | - | - | - | - | - | - |
	| | URY KOT Error Log | 0 | ✓ | ✓ | ✓ | ✓ | - | - | - | - | - | - | - | - | - | - |
	
	</details>

### Step 3 : Branch

- Create [Branch](https://frappehr.com/docs/v14/en/branch) in ERPNext.

	Branch setup manage users, POS access, and aggregator configurations for delivery platforms, ensuring smooth operations.

	<div style="text-align: center;">
		<img src="https://raw.githubusercontent.com/ury-erp/ury/refs/heads/develop/DEMO/Branch.png" style="margin: 2rem 2rem;" alt="Branch">
	</div>

- Specify branch users in the table; note that only these users can access the  POS of that branch.
	- **Aggregator Settings** : If your restaurant uses aggregator platforms (such as food delivery services), configure the following details:
		- Customer : Create or link the customer profile for aggregator orders.
		- Price List : Create a Selling type price list for the aggregator and ensure that item prices are added to this list so they appear correctly in the menu.
		- Mode of Payment : Set up a mode of payment for aggregator transactions.
	- **Keep Sales Invoice Unpaid** : Check this box if you want the aggregator's sales invoice to remain unpaid.
	- **Create Invoice without Tax** : Check this box if you want the aggregator's invoice to be created without tax. This applies to both Sales Invoice and POS Invoice.


### Step 4 : URY Restaurant

- Go to the "URY Restaurant List" and create a new restaurant with the following details:

	The restaurant setup links your company, branch, and menu together, defining details like tax templates, invoice series, and menu configurations for rooms and order types.

	<div style="text-align: center;">
		<img src="https://raw.githubusercontent.com/ury-erp/ury/develop/DEMO/URY%20Restaurant.png" style="margin: 2rem 2rem;" alt="URY Restaurant">
	</div>

	- **Name** : Restaurant name
	- **Company**: Specify the company under which the restaurant is being created.
	- **Invoice Series Prefix**: allows you to define prefix for naming of an Invoice .
	- **Aggregator Series Prefix**: allows you to define prefix for naming of a aggregator Invoice.
	- **Branch** : Select the branch associated with the restaurant .
	- **Default Tax Template** : Mention the [Sales tax](https://docs.erpnext.com/docs/user/manual/en/sales-taxes-and-charges-template) value if applicable.
	- **Address** : Provide the address of the restaurant.
	- **Default Menu** : Select Menu against the restaurant.
	- **Room Wise Menu** : To enable room wise menu.
	- **Menu For Room** : Add restaurant menu against each room to handle room wise price list. 
	- **Order Type Wise Menu** : To enable order type wise menu for cashier.
	- **Menu For Order Type** : Add restaurant menu against each order type to handle order type wise price list.

### Step 5 : URY Room

- Next is to Create Restaurant Room with the following details :

	Rooms help organize your restaurant layout—such as indoor, outdoor, or VIP areas and define where orders and print actions (like bills or KOTs) are directed. Each room can have its own printer setup to manage room-wise printing. Make sure to add the room to the corresponding URY Restaurant.

	<div style="text-align: center;">
		<img src="https://raw.githubusercontent.com/ury-erp/ury/refs/heads/develop/DEMO/URY%20Room.png" style="margin: 2rem 2rem;" alt="URY Room">
	</div>

	- **Name** : Specify a unique name to the room.
	- **Room Type** : Select the type from the list.
	- **Print Settings** : Choose a network printer.
	- **Bill** : Enable for Invoice Printing .
	- **KOT Print** : Enable for KOT Printing .

### Step 6 : Item

- Create [Item](https://docs.erpnext.com/docs/user/manual/en/item) to be included in the URY Menu.
- If an item is sold in a bundle, consider using the [Product Bundle](https://docs.erpnext.com/docs/user/manual/en/product-bundle) feature.


### Step 7 : URY Menu

- Create Restaurant Menu From "URY Menu List" with the following details:

	Menu define the list of items available for order, their prices, and how they’re displayed in the POS.
	<div style="text-align: center;">
		<img src="https://raw.githubusercontent.com/ury-erp/ury/develop/DEMO/URY%20Menu.png" style="margin: 2rem 2rem;" alt="URY Menu">
	</div>

	- **Name** : Specify a unique name to the menu .
	- **Restaurant** : Linked to URY Restaurant to select restaurant .
	- **Branch** : This field will be automatically populated when you select a restaurant.
	- **Enabled** : Activate the checkbox to enable the menu.
	- **Items** : List the items included in the menu and their respective rates.
	- **Special Dish** : You can use this checkbox in the Item table to show an item as a `Special Items` or `Priority` item for menu display.
	- **Disabled** : You can use this checkbox to remove item from menu as per need.
	- **Course** : Categorize each item based on the course type (e.g., Starters, Mains, Desserts). In POS, the menu can be categorized and viewed by Course. If the **Indicate in KDS** checkbox is enabled for a course, the Kitchen Display System (KDS) will use the serving priority to determine the preparation and serving order of items.

	Example:
	<div style="text-align: center;">
		<img src="https://raw.githubusercontent.com/ury-erp/ury/develop/DEMO/URY%20Menu%20Course.png" style="margin: 2rem 2rem;" alt="URY Menu Course">
	</div>

### Step 8 : URY Table

- Create tables for the restaurant in the "URY Table List" with the following details:

	Tables define the seating layout, their availability and are visually displayed on the POS for easy selection.

	<div style="text-align: center;">
		<img src="https://raw.githubusercontent.com/ury-erp/ury/refs/heads/develop/DEMO/URY%20Table.png" style="margin: 2rem 2rem;" alt="URY Table">
	</div>

	- **Name** : Specify the table name that will be listed in URY Order.
	- **Restaurant** : Select the associated restaurant.
	- **Restaurant Room** : Specify a room to which the table belong ( if no room in restaurant , create a default room and select it for all)
	- **Branch** : This field will be auto-populated when the restaurant is selected.
	- **No of seat** : Input the number of seats at the table.
	- **Minimum seating** : Specify minimum seating capacity .
	- **Is Take Away** : For take away orders ( Order type will be "Take Away") .
	- **Active info** : Record table status and time . Both are read-only .
	- **Table Shape** : Use this option to add the table shape for display on the POS screen.


### Step 9 : POS Profile
    
- [Create POS Profile](https://docs.erpnext.com/docs/user/manual/en/pos-profile) in ERPNext with the following additional fields:
        
- **Printer Info**

	- Configure printing options for invoices and KOTs. For network printers, select the printer in the printer settings table. For QZ printing, enable QZ Print and enter the host IP.
   
	 <p>
		<div style="text-align: center;">
			<img src="https://raw.githubusercontent.com/ury-erp/ury/develop/DEMO/POS%20Profile%20Network%20Printer.png" style="margin: 2rem 2rem;" alt="POS Profile QZ">
		</div>
	</p>
	
	- **Printer Settings** : Select a printer, enable Bill for invoice printing and KOT Print for KOT printing. For multiple rooms with separate printers, configure the printer settings in the corresponding URY Room for room-wise printing.

	 <p>
		<div style="text-align: center;">
			<img src="https://raw.githubusercontent.com/ury-erp/ury/develop/DEMO/POS%20Profile%20QZ.png" style="margin: 2rem 2rem;" alt="POS Profile QZ">
		</div>
	</p>
	
	- **QZ Print** : Check this box to enable QZ printing.
	- **QZ Host** : Enter the Network IP for QZ printing.	

- **URY POS Restrictions**

	- Set role-based permissions, cashier access, table order restrictions, and operational settings such as attention time, discount, daily POS closing, and visibility of paid invoices.

	<p>
		<div style="text-align: center;">
			<img src="https://raw.githubusercontent.com/ury-erp/ury/refs/heads/develop/DEMO/POS%20Profile%20Restrictions.png" style="margin: 2rem 2rem;" alt="POS Profile Restrictions">
		</div>
	</p>

	- **Captain Transfer Role Permissions** : Roles added to this field will have permission for 'Captain Transfer'. Users with this role will also have access to all tables.
	- **Role Allowed For Billing** : Users assigned this role will function as cashiers in URY POS, responsible for managing billing transactions.
	- **Role Restricted For Table Order** : Users with this role have restricted access to table order functions.
	- **Table Attention Time** : To indicate "Attention" status in the table of URY POS.
	- **Show Limited Paid Invoices** : Set a limit for the cashier to view a restricted number of recently paid invoices.
	- **Allow Cashier To View All Status** : Enables Cashiers to view all statuses (Paid, Consolidated, Return Invoices) in the recent order.
	- **Allow Cashier To Edit And Remove Table Order Items** : To permit cashier to edit and remove table orders.	
	- **Show Item Image In URY POS** : To show image in URY POS.
	- **Require Daily POS Closing** : Validate that the previous day’s POS is closed before opening a new one.
	- **Enable Discount** : Enable discount feature in URY POS.
	- **Enable Order Type Edit** : Use this option to change the order type of an existing invoice.
			
- **Multiple Cashier Configuration**
	- **Enable Multiple Cashier** : Enable this checkbox if the outlet has multiple cashiers. Then, add the cashiers under 'Applicable for Users' and enable the 'Main Cashier' checkbox for the head cashier.
			
- **KOT Settings**

	- Configure how Kitchen Order Tickets (KOTs) are managed and monitored, including naming series, timers, reprint and audio alert options, delay notifications with recipients, and daily order number resets to streamline kitchen operations.
 
	<p>
		<div style="text-align: center;">
			<img src="https://raw.githubusercontent.com/ury-erp/ury/refs/heads/develop/DEMO/POS%20Profile%20KOT%20Settings.png" style="margin: 2rem 2rem;" alt="POS Profile KOT Settings">
		</div>
	</p>
	
	- **URY KOT Naming Series** : Add a naming series for KOT. A KOT will be created only if a naming series is set.
	- **KOT Warning Time** : Timer against KOT are set in this field to trigger a warning when it's exceeded in KDS.
	- **Enable KOT Reprint** : Use this option if you need the reprint feature for KOT prints. Make sure to add the appropriate printers and print format.
	- **Enable KOT Audio Alert** : Can enable to play a sound when a KOT is displayed. You can add an audio alert in the `KOT alert sound` attachment field.
	- **Notify KOT Delay** : Can enable for KOT delay notification and add recipient roles to the Recipients table.
	- **Recipients (By Role)** : Add roles of users to receive KOT delay notifications.
	- **Reset Order Number Daily** : Use this option to reset the order number for POS Invoices on a daily basis. Note that this is not the invoice number.
	
> **Note:** Update the Price List in Accounting to restaurant menu price list.

### Step 10: URY Production Unit

- **URY Production Unit**
 	Create Production Unit From "URY Production Unit" with the following details:

	Production Units manage multiple kitchens, each with its own web-based interface for displaying KOTs in the Kitchen Display System (KDS). Printers can also be configured per unit for physical KOTs if needed.

	<div style="text-align: center;">
		<img src="https://raw.githubusercontent.com/ury-erp/ury/refs/heads/develop/DEMO/URY%20Production%20Unit.png" style="margin: 2rem 2rem;" alt="URY Production Unit">
	</div>

  - **Production** : Enter the name for your Production Unit.
  - **POS Profile** : Select the POS Profile
  - **Branch** : Auto fetch when pos profile is selected 
  - **Warehouse** :Auto fetch when pos profile is selected.
  - **Item Groups** :Select Item Groups that belong to the production unit.
  - **Printers** : Table to configure printing inside production unit.
    - **Printer** : Select Network printer.
    - **KOT Print** : Enable for KOT Printing .
    - **KOT Print Format** : Select print format for KOT .
    - **Block Takeaway KOT** : Enable for block Takeaway KOT printing .

> **Note:** To access KDS follow the site url with `/URYMosaic/Production%20Unit%20Name`. eg: [https://ury.xxxx.com/URYMosaic/Kitchen](https://ury.xxx.com/URYMosaic/Kitchen)

### Step 11 : User Permissions

- User Permissions control access to specific records in ERPNext. Give [User Permission](https://docs.erpnext.com/docs/user/manual/en/user-permissions) to the user for the documents they need to access, such as:
	- POS Profile 
	- Branch

### Step 12 : Printer Setup

- QZ Printer
	-  Add your certificate file is at `ury/public/files/cert.pem`.
	- Update the `pos/privateKey.js` for v2 and `urypos/privateKey.js` for v1.
- Network Printer
	- Set up CUPS (Common Unix Printing System) for network printing.
	- In Network Printer Settings, add your printers and note their and enter the corresponding printer in the URY Room for invoice printing from POS.

<p>
	<div style="text-align: center;">
		<img src="https://raw.githubusercontent.com/ury-erp/ury/refs/heads/develop/DEMO/Network%20Printer%20Settings.png" style="margin: 2rem 2rem;" alt="Network Printer Settings">
	</div>
</p>

### Step 13 : Customer Search

- frappe.utils.global_search is used for customer searching ,you have to run the following commands for building search index

```
bench --site site-name build-search-index 
```

and

```
bench --site site-name rebuild-global-search 
```

### Step 14: Multiple Cashier Configuration
	
- Follow the steps below to set up and manage multiple cashier operations in URY, allowing multiple cashiers to handle billing under one POS profile with individual transaction control.
- **Create Cashier User** : Create user with the URY Cashier role.
- **Assign Rooms** : Assign URY Rooms to users. Users can only access POS for the rooms they are assigned to.
- **Configure POS Profile** : 
	- In the Applicable for Users table of the POS Profile, add all cashiers for the POS and enable Main Cashier for the head cashier.
	- Enable Multiple Cashier in the Multiple Cashier Configuration.
- **Workflow**
	- POS Opening
		- The main cashier creates the POS Opening Entry first, followed by sub cashier. The main cashier must always open the POS first.
	- Order Processing
		- Proceed with normal order taking and restaurant operations.
	- Sub POS Closing

		<div style="text-align: center;">
			<img src="https://raw.githubusercontent.com/ury-erp/ury/refs/heads/develop/DEMO/Sub%20POS%20Closing.png" style="margin: 2rem 2rem;" alt="Sub POS Closing">
		</div>

		- Sub cashier creates a Sub POS Closing Entry.
		- Sub POS Closing Entry is an URY Doctype to reconcile sub cashier transactions separately.
	- POS Closing
		- Main cashier creates a POS Closing Entry

### Step 15: URY Report Setting

- Navigate to **URY Report Settings** in  your site. 
- Click on **Add URY Report Settings**.
- Under the **Details** tab:
	- **Extended Hours** : Enable this if the branch operates after 12 AM.
	- **No of Hours** : Enter the number of hours, if extended hours is enabled. 
- Under the **Daily P and L Settings** tab:
	- **Buying price List** : Select the buying price list for your branch.
		- Under **Direct Expenses**:
			- **Burning Materials (Other Consumables)** : Table to list consumables.
				- **Material** : Enter the Material (e.g., gas, charcoal).
				- **Cost Per Unit** : Specify the cost per unit for each material.
			- **Direct Fixed Expenses** : Table to add list of daily fixed direct expenses.
				- **Expense** : Provide the expense name.
				- **Amount** : Specify amount for each expense.
		- Under **Indirect Expenses**:
			- **Electricity Charges**: Enter the electricity charges per unit.
			- **Indirect Fixed Expenses** : Table to list daily fixed indirect expenses.
				- **Expense** : Provide the expense name.
				- **Amount** : Specify amount for each expense.
			- **Percentage Expenses** : Table to list of expenses as a percentage of sales.
				- **Expense** : Provide the expense name.
				- **Percentage Type** : Choose the percentage type (Net Sales or Gross Sales).
				- **Percent** : Specify the percentage of the selected type.
		- Under **Employee Costs**:
			- **Employee Costs** : Table to list daily fixed expenses as a part of employee costs.
				- **Expense** : Provide the expense name.
				- **Amount** : Specify amount for each expense.
	- **Depreciation** : Add depreciation amount if applicable.


- **Daily Gross Salary Cost is calculated from employees attendance.**
	- Follow these steps to set up the payment type and payment amount for employees:

	#### Step 1:

	- Navigate to **Employee** in  your site. 
	- Choose the relevant **Employee**.

	#### Step 2:

	- Under the **Salary** tab:
		- **Payment Type** : Choose between Salary or Daily Wage.
		- **Payment Amount** : Enter the corresponding payment amount. 


Follow the [Attendance documentation](https://frappehr.com/docs/v14/en/attendance#3-features) for marking the attendance or use the [Employee Attendance Tool](https://frappehr.com/docs/v14/en/employee-attendance-tool#2-how-to-mark-attendance-using-employee-attendance-tool)
