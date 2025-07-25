# URY Installation

While URY may work on existing ERPNext instance, it is recommended that you setup URY on a new  frappe site created for URY.


- Install ERPNext using the [official installation guide](https://github.com/frappe/bench#installation).

**To Install ERPNext to your bench:**

```sh
	$ bench get-app --branch version-14 erpnext https://github.com/frappe/erpnext.git
```

**Install the URY app to your bench:**

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

**Build the site :**

```sh
	$ bench --site sitename build
```

**Migrate the site :**

```sh
	$ bench --site sitename migrate
```
