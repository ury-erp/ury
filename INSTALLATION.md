# URY Installation

While URY may work on existing ERPNext instance, it is recommended that you setup URY on a new  frappe site created for URY.


- Install ERPNext using the [official installation guide](https://github.com/frappe/bench#installation).

**To Install ERPNext to your bench:**

```sh
	$ bench get-app --branch version-14 erpnext https://github.com/frappe/erpnext.git
```

**Install the URY base app to your bench:**

```sh
	$ bench get-app ury https://github.com/ury-erp/ury.git
```
**Create New site :**

```sh
	$ bench new-site sitename
```
**Install ERPNext to the site :**

```sh
	$ bench --site sitename install-app erpnext
```

**Install URY base app to the site :**

```sh
	$ bench --site sitename install-app ury
```
**Migrate the site :**

```sh
	$ bench --site sitename migrate
```



## To install URY Mosaic, follow these steps:



**Install the URY Mosaic app to your bench:**

```sh
	$ bench get-app ury_mosaic https://github.com/ury-erp/mosaic.git
```

**Install the URY Mosaic into site:**

```sh
	$ bench --site sitename install-app ury_mosaic
```


## To install URY POS , follow these steps:



**Install the URY POS app to your bench:**

```shPrint
	$ bench get-app ury_pos https://github.com/ury-erp/pos.git
```

**Install URY POS into site:**

```sh
	$ bench --site sitename install-app ury_pos
```
	
	

## To install URY Pulse, follow these steps:



**Install the URY Pulse app to your bench:**


```sh
	$ bench get-app ury_pulse https://github.com/ury-erp/ury_pulse.git
```

**Install URY Pulse into site:**

```sh
	$ bench --site sitename install-app ury_pulse
```