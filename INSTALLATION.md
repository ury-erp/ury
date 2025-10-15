# URY Installation

While URY may work on existing ERPNext instance, it is recommended that you setup URY on a new  frappe site created for URY.

<div align="center">
	<a href="https://frappecloud.com/dashboard/signup?product=ury" target="_blank">
		<picture>
			<source media="(prefers-color-scheme: dark)" srcset="https://frappe.io/files/try-on-fc-white.png">
			<img src="https://frappe.io/files/try-on-fc-black.png" alt="Try on Frappe Cloud" height="28" />
		</picture>
	</a>
</div>



> :information_source: Note :
> Minimum Node Version 18.18.*+ required


- Install ERPNext using the [official installation guide](https://github.com/frappe/bench#installation).

**To Install ERPNext to your bench:**

```sh
	bench get-app --branch version-15 erpnext https://github.com/frappe/erpnext.git
```

**Install the URY app to your bench:**

```sh
	bench get-app ury https://github.com/ury-erp/ury.git
```
**Create New site :**

```sh
	bench new-site sitename
```
**Install ERPNext to the site :**

```sh
	bench --site sitename install-app erpnext
```

**Install URY base app to the site :**

```sh
	bench --site sitename install-app ury
```

**Build the site :**

```sh
	bench --site sitename build
```

**Migrate the site :**

```sh
	bench --site sitename migrate
```



## To install URY Mosaic, follow these steps:



**Install the URY Mosaic app to your bench:**

```sh
	bench get-app ury_mosaic https://github.com/ury-erp/mosaic.git
```

**Install the URY Mosaic into site:**

```sh
	bench --site sitename install-app ury_mosaic
```


## To install URY POS , follow these steps:



**Install the URY POS app to your bench:**

```shPrint
	bench get-app ury_pos https://github.com/ury-erp/pos.git
```

**Install URY POS into site:**

```sh
	bench --site sitename install-app ury_pos
```
	
	

## To install URY Pulse, follow these steps:



**Install the URY Pulse app to your bench:**


```sh
	bench get-app ury_pulse https://github.com/ury-erp/ury_pulse.git
```

**Install URY Pulse into site:**

```sh
	bench --site sitename install-app ury_pulse
```
