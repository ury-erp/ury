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

- Assign one of the two URY roles to users:
	- URY Manager 
	- URY Captain 

- In extra , Use ERP provided roles for permissions related to ERP functionality.
	- Possible role for restaurant order takers/ captains can be - Item Manager ,Accounts User ,Sales User.
	- For Restaurant Managers - Item Manager ,Sales Manager ,Accounts Manager ,Stock Manager ,Sales User.
	

**Step 3 :**

- Create [Branch](https://frappehr.com/docs/v14/en/branch) in ERPNext .

- Specify branch users in the table; note that only these users can access the Point of Sale (POS) of that branch.

**Step 4 :**

- Go to the "URY Restaurant List" and create a new restaurant with the following details:

	- **Name** : Restaurant name
	- **Company**: Specify the company under which the restaurant is being created.
	- **Default customer** : Set a default customer .
	- **Invoice Series Prefix**: allows you to define prefix for naming of a Invoice .
	- **Branch** : Select the branch associated with the restaurant .
	- **Default Tax Template** : Mention the [Sales tax](https://docs.erpnext.com/docs/user/manual/en/sales-taxes-and-charges-template) value if applicable .
	- **Address** : Provide the address of the restaurant.
	- **Default Menu** : Select Menu against the restaurant .
	- **Room Wise Menu** : To enable room wise menu .
	- **Menu For Room** : Add restaurant menu against each room to handle room wise price list. 


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


**Step 9 :**

- [Create POS Profile](https://docs.erpnext.com/docs/user/manual/en/pos-profile) in ERPNext
- Addition fields 
	- **Restaurant** : Select Restaurant in which POS Profile belong.
	- **Branch** :  The branch will be auto-fetched when selecting the restaurant.
	- **Printer Settings** : Choose a network printer. 
	- **QZ Print** :  Check this box to enable QZ printing.
	- **QZ Host** :Enter the Network IP for QZ printing.
	- **Captain Transfer Role Permissions** : Role added to this field have permission for `Captain Transfer`. Also user having this role have access to all table.
	- **Allow Cashier To Edit And Remove Table Order Items** : To permit cashier to edit and remove table orders. 

**Step 10 :**

- Give [User Permission](https://docs.erpnext.com/docs/user/manual/en/user-permissions) to the user for 
	- POS Profile 
	- Branch

**Step 11 :**

- To prevent alerts during printing with QZ Tray and address the two promise messages, follow these standardized steps:

- **Signature Promise** 
	- Add path of your qz certificate in the `site_config.json` under the key "qz_cert".
	- Eg: If your certificate file is at `/private/files/cert.pem` , then the value follows ,

	```sh
		"qz_cert": "files/cert.pem
	```
- **Sign Message**
	- Add path of your file containing Private Key to Prevent sign message alert in the `site_config.json` under
	the key "qz_private_key".
	- Eg: If your file is at `/private/files/key.pem` , then the value follows ,

	```sh
		"qz_private_key": "files/key.pem
	```
- Authorized personnel can upload the files through ERPNext's File Manager.
- Ensure that both files are uploaded as private files.

**Step 12 :**

- Go to POS Settings
- Add 'Print' button to Additional Information to take print before settlement

**Step 13 :**

- This step is optional and applicable when the mobile number is automatically fetched from the customer name field.
- Open the client script and ensure that the script responsible for the provided code is enabled.
- The purpose is to extract the number from the customer name field and write it to the mobile number field.
- Give default value to Customer Group and Territories using doctype customisation.

**Step 14 :**

- Go To 'URY Order' and take your first order.

