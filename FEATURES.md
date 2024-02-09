# Features of URY Base App


**POS Opening and Closing**

- URY is integrated with the [Point Of Sale](https://docs.erpnext.com/docs/user/manual/en/point-of-sales#3-4-create-return-credit-note) functionality of ERPnext to manage opening and closing in restaurant workflow.

- It's important to note that if no POS Opening is initiated for the day, URY will not allow table selection, ensuring precise tracking of operations. 

**Table Selection**

- URY workflow begins with table selection.

- The first step involves creating URY tables. To do this, navigate to the 
	URY Table List > Add URY Table
	[is take away checkbox is used for take away table orders]

- Tables are visually represented as cards, providing flexibility in the selection process.

- To enhance clarity, tables are color-coded with three indicators:
    - Red: Indicates occupied tables (when the "occupied" value is true).
    - Green: Signifies available tables (when "occupied" is false).
    - Blue: Highlights the currently selected table.

- Table time is displayed within each card

**Menu Selection**

- Selecting Menu Item is the next step .

- Menus are created from : URY Menu List > Add URY Menu.

- Within each menu,list individual menu items in the child table. 

- Special Menu items can be prioritized for selling using a checkbox.

- Specified rates in the table automatically creates a 'Price list' using the same menu name.

- Default menu is added in URY Restaurant. 

- Room wise menu is handled by enabling room wise menu and adding values in the child table.

- If room wise menu is enabled , ury take menu as per the room defined against each table on table selection.

- Menu Selection tab contain : 
	- Search bar to quickly locate specific menu items, enhancing speed and accuracy during busy periods.

	- Menu filtering with Button
		`All` - Display all menu item.
		`Priority` - displays only prioritized items.

	- Menus are presented in a card format which includes the menu name, selected quantity of the item , and  +/- buttons for adjusting quantities.

	- For precise quantity adjustments, users can click on the quantity display, triggering a dialogue box for easy modification.

**Order Taking** 

- This is the Key step of restaurant work flow.

- Input customer details and the number of guests (Pax Count) in Customer Info Tab.

- For returning customers, URY displays their top three ordered items in Favourite item section.

- In Order info tab show selected menu items in a list view.

- Quantity adjusted can be adjusted from here also by clicking on the quantity field.

- Action Buttons in Table Order are ,

	- *Update* : Used to generate an order, ie. creating a POS invoice in draft status.
	- *Cancel* : To cancel order (draft invoice) and clear the table.
	- *Print* : To generate a bill against the order, clearing the table.
	- *Table Transfer* : Transfer an order from one table to another after placing the initial order. Clear the original table, and occupy the new table.
	- *Captain Transfer* : Enables the transfer of an order from one captain to another after placing an order at a table.

- After triggering the Update Button, a restaurant order is placed, and the POS invoice ID is then updated in the 'Last Order' field for reference.

- On selecting a table with an existing order, URY will automatically navigate to the order tab.

**Order Printing**

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

**Invoice Settlement**

- The settlement of invoices is performed from Point Of Sale interface.

- Table Orders are listed in the "*Toggle Recent Order*" section. 

- To cancel an invoice, select "*Cancel Order*" from the menu bar. Invoices which is printed cannot be cancelled.

- URY introduces a new status, "*To Bill*" which filters POS invoices in draft and not printed from the Table Order.

-  In `Additional Information` Section :
	- Order Type : Select type of order listed 
	- Print : Button to print unprinted invoices