## URY Base App Setup 

Follow these steps to set up URY:

**Step 1 :**

- Login into the site and Follow the installation wizard 
	- Specify the language.
	- Provide country , timezone and currency details.
	- Create the first user.
	- Enter company name, its description, and select a bank account.
	- click on 'Complete setup'
	
**Step 2 :**

- Use the [Frappe/ERPNext interface](https://docs.erpnext.com/docs/user/manual/en/adding-users) to create a new user. 

- Assign one of the three URY roles to users:
	- URY Manager 
	- URY Captain 
	- URY Cashier

- In extra , Use ERP provided roles for permissions related to ERP functionality.
	- Possible role for restaurant order takers/ captains can be - Item Manager ,Accounts User ,Sales User.
	- For Restaurant Managers - Item Manager ,Sales Manager ,Accounts Manager ,Stock Manager ,Sales User.
	- For Restaurant Cashier - Item Manager ,Sales Manager ,Accounts Manager ,Stock Manager ,Sales User.

**Step 3 :**

- Create [Branch](https://frappehr.com/docs/v14/en/branch) in ERPNext .

- Specify branch users in the table; note that only these users can access the  POS of that branch.
	- **Aggregator Settings** : You can use this child table to add aggregator details, create a customer, price list (as Selling), and mode of payment as needed for aggregator data. Make sure to add item prices to the selected price list to display items in the menu.
	- **Keep Sales Invoice Unpaid** : Check this box if you want the aggregator's sales invoice to remain unpaid.
	- **Create Invoice without Tax** : Check this box if you want the aggregator's invoice to be created without tax. This applies to both Sales Invoice and POS Invoice.


**Step 4 :**

- Go to the "URY Restaurant List" and create a new restaurant with the following details:

	- **Name** : Restaurant name
	- **Company**: Specify the company under which the restaurant is being created.
	- **Invoice Series Prefix**: allows you to define prefix for naming of a Invoice .
	- **Aggregator Series Prefix**: allows you to define prefix for naming of a aggregator Invoice.
	- **Branch** : Select the branch associated with the restaurant .
	- **Default Tax Template** : Mention the [Sales tax](https://docs.erpnext.com/docs/user/manual/en/sales-taxes-and-charges-template) value if applicable .
	- **Address** : Provide the address of the restaurant.
	- **Default Menu** : Select Menu against the restaurant .
	- **Room Wise Menu** : To enable room wise menu .
	- **Menu For Room** : Add restaurant menu against each room to handle room wise price list. 
	- **Order Type Wise Menu** : To enable order type wise menu for cashier.
	- **Menu For Order Type** : Add restaurant menu against each order type to handle order type wise price list. 



**Step 5 :**

- Create [Item](https://docs.erpnext.com/docs/user/manual/en/item) to be included in the URY Menu.
- If an item is sold in a bundle, consider using the [Product Bundle](https://docs.erpnext.com/docs/user/manual/en/product-bundle) feature.


**Step 6 :**

- Create Restaurant Menu From "URY Menu List" with the following details:

	- **Name** : Specify a unique name to the menu .
	- **Restaurant** : Linked to URY Restaurant to select restaurant .
	- **Branch** : This field will be automatically populated when you select a restaurant.
	- **Enabled** : Activate the checkbox to enable the menu.
	- **Items** : List the items included in the menu and their respective rates.
	- **Special Dish** : You can use this checkbox in the Item table to show an item as a `Special Items` or `Priority` item for menu display.
	- **Disabled** : You can use this checkbox to remove item from menu as per need.
	- **Course** : To add course again item.

**Step 7 :**

- Next is to Create Restaurant Room with the following details :

	- **Name** : Specify a unique name to the room.
	- **Room Type** : Select the type from the list.
	- **Print Settings** : Choose a network printer.

**Step 8 :**

- Create tables for the restaurant in the "URY Table List" with the following details:

	- **Name** : Specify the table name that will be listed in URY Order.
	- **Restaurant** : Select the associated restaurant.
	- **Restaurant Room** : Specify a room to which the table belong ( if no room in restaurant , create a default room and select it for all)
	- **Branch** : This field will be auto-populated when the restaurant is selected.
	- **No of seat** : Input the number of seats at the table.
	- **Minimum seating** : Specify minimum seating capacity .
	- **Is Take Away** : For take away orders ( Order type will be "Take Away") .
	- **Active info** : Record table status and time . Both are read-only .
	- **Table Shape** : Use this option to add the table shape for display on the POS screen.


**Step 9 :**

- [Create POS Profile](https://docs.erpnext.com/docs/user/manual/en/pos-profile) in ERPNext
- Addition fields 
	- **Restaurant** : Select Restaurant in which POS Profile belong.
	- **Branch** :  The branch will be auto-fetched when selecting the restaurant.
	- **Printer Settings** : Choose a network printer. 
	- **QZ Print** :  Check this box to enable QZ printing.
	- **QZ Host** :Enter the Network IP for QZ printing.
	- **Captain Transfer Role Permissions** :Under URY POS restrictions, roles added to this field will have permission for 'Captain Transfer'. Users with this role will also have access to all tables.
	- **Role Allowed For Billing** : Users assigned this role will function as cashiers in URY POS, responsible for managing billing transactions.
	- **Table Attention time** : To indicate "Attention" status in the table of URY POS. 
	- **Show Limited Paid Invoices** : Set a limit for the cashier to view a restricted number of recently paid invoices.
	- **Allow Cashier To View All Status** : Enables Cashiers to view all statuses (Paid, Consolidated, Return Invoices) in the recent order.
	- **Role Restricted For Table Order** : Users with this role have restricted access to table order functions.
	- **Allow Cashier To Edit And Remove Table Order Items** : To permit cashier to edit and remove table orders.
	- **Show Item Image In URY Pos** : To show image in URY POS.
	- **Require Daily POS Closing** : Validate that the previous day’s POS is closed before opening a new one.
	- **Enable Discount** : Enable discount feature in URY POS.
	- **Enable Order Type Edit** : Use this option to change the order type of an existing invoice.
	- **Enable Multiple Cashier** : Enable this checkbox if the outlet has multiple cashiers. Then, add the cashiers under 'Applicable for Users' and enable the 'Main Cashier' checkbox for the head cashier.
	- **URY KOT Naming Series** : Add a naming series for KOT. A KOT will be created only if a naming series is set.
	- **KOT Warning Time** : Timer against KOT are set in this field to trigger a warning when it's exceeded in KDS.
	- **Enable KOT Reprint** : Use this option if you need the reprint feature for KOT prints. Make sure to add the appropriate printers and print format. 
	- **Enable KOT Audio Alert** : Can Enable to play a sound when a KOT is displayed. You can add an audio alert in the `KOT alert sound` attachment field.
	- **Notify KOT Delay** : Can Enable for KOT delay notification and add recipients roles to the Recipients table.
	- **Reset Order Number Daily** : Use this option to reset the order number for POS Invoices on a daily basis. Note that this is not the invoice number.


**Step 10 :**

- Give [User Permission](https://docs.erpnext.com/docs/user/manual/en/user-permissions) to the user for 
	- POS Profile 
	- Branch

**Step 11 :**

- **QZ printer Setup** 
	-  Add your certificate file is at `ury/public/files/cert.pem`.
	- Update the `pos/privateKey.js` for v2 and `urypos/privateKey.js` for v1.

**Step 12 :**

- **Customer Search**
	- frappe.utils.global_search is used for customer searching ,you have to run the following commands for building search index
	
	```
   		$ bench --site site-name build-search-index 
	```

   and

	```
   	$ bench --site site-name rebuild-global-search 
	```

**Step 13:**

- **URY Production Unit**
 	Create Production Unit From "URY Production Unit" with the following details:
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

**Step 14:**

- **URY Report Setting**
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
