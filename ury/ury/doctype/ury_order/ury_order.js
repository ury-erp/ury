//  Copyright (c) 2023, Tridz Technologies Pvt. Ltd. and contributors
//  For license information, please see license.txt

/**
 * DISCLAIMER:
 * 
 * This code implements order-taking app and was developed live in a restaurant  as a quick solution to address immediate needs.
 * 
 * Current Usage:
 * - The solution is currently operational in over 8 restaurants.
 * - It handles more than 1000 bills per day.
 * 
 * Code Quality:
 * - Initially live-coded as a client script and later moved to the app.
 * - Code may be messy, hard to understand, and not optimally efficient.
 * 
 * Maintenance and Future Work:
 * - This solution will continue to be maintained.
 * - A more refined version, built using Vue.js, is available in the URY POS repository and is recommended for future use.
 */

let array_of_menu = [];
let table_html = '';
let restaurant_name = '';
let currentTable = []
let table_list_div = '';
let branch_g = ""
let rstnt_menu_items = '';
let total_time = ""

frappe.ui.form.on('URY Order', {
	setup: function (frm) {
		let get_item_query = () => {
			return {
				query: 'ury.ury.doctype.ury_order.ury_order.item_query_restaurant',
				filters: {
					'table': frm.doc.restaurant_table
				}
			};
		};
		frm.set_query('item', 'items', get_item_query);
		frm.set_query('add_item', get_item_query);
	},

	onload: function (frm) {
		$('.ellipsis.title-text').hide();
		frappe.call({
			method: 'ury.ury.doctype.ury_order.ury_order.pos_opening_check',
			callback: function (r) {
				if (!r.message) {
					frappe.msgprint('Server Error');
				}
				else if (!r.message.opening_exists) {
					frappe.msgprint('POS Opening Entry is not created');
					document.addEventListener('click', function () {
						window.location.reload();
					});
				}
				else if (!r.message.cashier || !r.message.pos_profile) {
					frappe.msgprint('Incomplete data. Check POS Opening Entry.');
				}
				else {
					frappe.dom.unfreeze();
					if (r.message.opening_exists) {
						// Set the cashier in URY Order
						frm.set_value('cashier', r.message.cashier);
						frm.set_value('waiter', frappe.session.user);
						frm.set_value('pos_profile', r.message.pos_profile)

					}
				}
			}
		});
	},

	onload_post_render: function (frm) {

		$('.items-container .item-wrapper').click((e) => {
		})

		// For adding placeholder in search box
		$("[data-fieldname='item_search']").addClass("item_search");
		$(".item_search").attr('placeholder', 'Search')

	},

	refresh: function (frm) {

		const check = localStorage.getItem('check');
		frm.disable_save();

		frm.trigger('update_btn');

		$("[data-fieldname='no_of_pax']").on('focus', 'input', function (e) {
			$(this).prop('type', 'number');
			$(this).on('input', function (event) {
				let inputValue = e.target.value;
				if (parseInt(inputValue) < 0) {
					// If negative, set the input value to an empty string
					event.target.value = '0';
				}
			});
		})

		$("[data-fieldname='qty']").on('click', 'input', function (e) {
			$(this).prop('type', 'number');
		})

		frappe.realtime.on('reload_ro', (data) => {
			if (frm.doc.last_invoice && data.name === frm.doc.last_invoice) {
				frappe.dom.freeze(__('Order Completed'));
				frappe.ui.toolbar.clear_cache();
			}
		});

		// disable logo click
		let logo_nav = document.querySelector('.navbar .navbar-brand')
		logo_nav.removeAttribute('href');

		//  button update in window for mobile screen
		if (window.innerWidth <= 768) {
			setTimeout(() => {
				const hideButtons = (buttons) => {
					buttons.forEach((button) => {
						const element = document.querySelector(`button[data-label="${button}"].btn-default`);
						if (element) {
							element.classList.add('d-none');
						}
					});
				};

				const buttonsToHide = ['Table%20Transfer', 'Print', 'Cancel', 'Captain%20Transfer'];
				hideButtons(buttonsToHide);

				document.querySelector('.custom-actions').classList.remove('hidden-xs', 'hidden-md');
			}, 1000);
		}


		const handleTableClick = (e) => {
			const tableId = e.target.id;
			currentTable = [tableId];

			frm.set_value('restaurant_table', tableId).then(() => {
				frappe.dom.freeze();

				const tabToClick = frm.doc.last_invoice ? '#ury-order-order_tab-tab' : '#ury-order-menu_tab-tab';
				$(tabToClick).click();

				frappe.dom.unfreeze();
			});

			frm.trigger('menu_listing');
			frm.trigger('get_menu');
			frm.trigger('display_menu');
		};

		const setTableListHtml = (tableHtml) => {
			const tableHtmlOpening = '<div class="container px-0"><div class="row" id="table_container">';
			const tableHtmlClosing = '</div></div>';
			const tableListHtml = tableHtmlOpening + tableHtml + tableHtmlClosing;

			$(frm.fields_dict.table_list.wrapper).html(tableListHtml);
			frm.page.wrapper.find('.the_table').on('click', handleTableClick);
		};

		const setTableHtml = (records) => {
			let tableHtml = '';
			records.forEach((tableList) => {
				const tableId = tableList.name;
				const isTableOccupied = tableList.occupied === 1;
				const isCurrentTable = currentTable.includes(tableId);
				const tableTime = tableList.latest_invoice_time;
				const bgColor = isTableOccupied ? 'var(--alert-bg-danger)' : 'var(--alert-bg-success)';

				let statusHtml = '';
				if (isTableOccupied) {
					const transactionTime = moment(tableTime, 'HH:mm');
					const currentTime = moment().format('HH:mm');
					const minutes = moment(currentTime, 'HH:mm').diff(transactionTime, 'minutes');
					const hours = Math.trunc(minutes / 60);
					const m1 = minutes % 60;
					const totalTime = `${hours}:${m1}`;
					statusHtml = `
						<h4 style="margin-top:10%;pointer-events:none;">${tableId}</h4>
						<h6 style="pointer-events:none;">${totalTime}</h6>`;
				} else {
					statusHtml = `<h4 style="margin-top:10%;pointer-events:none;">${tableId}</h4>`;
				}

				const backgroundColor = isCurrentTable ? '#73C2FB' : '';
				const tableListDiv = `
					<div class="col-lg-2 col-md-3 col-6 mr-0">
				    <div class="border the_table rounded text-center mb-4"
				        style="background: ${bgColor};min-height: 100px; background-color: ${backgroundColor};"
				        id="${tableId}">
				        ${statusHtml}
				    </div>
				</div>`;

				tableHtml += tableListDiv;
			});

			setTableListHtml(tableHtml);
		};

		frappe.db.get_list('URY Table', {
			fields: ['name', 'occupied', 'latest_invoice_time', 'restaurant'],
			limit: 10000
		}).then((records) => {
			records.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
			setTableHtml(records);
		});

		$('#ury-order-menu_tab-tab, #ury-order-order_tab-tab').on('click', function (e) {
			frm.trigger('get_menu');
			frm.trigger('display_menu');

			if (e.target.id === 'ury-order-menu_tab-tab') {
				refresh_field('item');
			}

		});

		function handleTabClick(tabId, message) {
			$("#" + tabId).on('click', function (e) {
				if (!frm.doc.restaurant_table) {
					frappe.msgprint({
						title: __('Warning'),
						message: __(message),
					});
					// Bind a click event to the body to capture clicks outside the message box
					$('body').one('click', function (event) {
						if (!$(event.target).closest('.modal-dialog').length) {
							$("#ury-order-table_tab-tab").click();
						}
					});
				}
			});
		}

		handleTabClick("ury-order-customer_tab-tab", "Select Table.");
		handleTabClick("ury-order-menu_tab-tab", "Select Table.");
		handleTabClick("ury-order-order_tab-tab", "Select Table.");

		$("[data-label='Print']").hide();
		localStorage.removeItem('check');
		frm.page.wrapper.find(".comment-box").css({ 'display': 'none' });

		// For adding class to all item in menu tab
		$("[data-fieldname='all_item']").addClass("float-right all_item").css({
			'margin-top': '.5%'
		});

		// For adding class to priority buttons in menu tab
		$("[data-fieldname='priority_item']").addClass("float-right priority_item").css({
			'margin-top': '.5%',
			'margin-right': '1%'
		});

		$("[data-fieldname='item_search']").on("click", function () {
			frm.set_value('item_search', '');
			frm.trigger('get_menu');
			frm.trigger('display_menu');
			refresh_field('item');
		});
		if (frm.doc.last_invoice) {
			frm.events.cancel_order(frm)
			frm.events.table_transfer(frm)
			frm.events.captain_transfer(frm)
			frm.events.print(frm)
		}
	},

	item_search(frm) {
		frm.trigger('get_menu');
	},

	menu_listing: function (frm, index) {
		frappe.call({
			method: 'ury.ury.doctype.ury_order.ury_order.get_restaurant_and_menu_name',
			args: {
				table: frm.doc.restaurant_table
			},
			callback: (r) => {
				array_of_menu = []
				frappe.db.get_doc('URY Menu', r.message[1]).then(item_list => {
					item_list.items.forEach(menu_item => {
						if (menu_item.disabled == 0) {
							let menu_item_list = []
							menu_item_list['item_name'] = menu_item.item_name
							menu_item_list['item_code'] = menu_item.item
							menu_item_list['rate_of_item'] = menu_item.rate
							menu_item_list['special_dish_menu'] = menu_item.special_dish
							array_of_menu = [...array_of_menu, menu_item_list]
							frm.events.quantity_add(frm, index, menu_item_list);
						}
					})
				})
			}
		});
	},

	calculate_total: function (frm, price, qty) {
		let total = frm.doc.grand_total
		let grand_total = total + (price * qty)
		cur_frm.set_value("grand_total", grand_total);
	},

	display_menu: function (frm) {
		$('#restaurant_menu_items').empty()
		if (array_of_menu.length > 0) {
			array_of_menu.map((menu_item_list, index) => {
				frm.events.item_list_card(frm, index, menu_item_list);
				frm.events.quantity_add(frm, index, menu_item_list);
				frm.events.qty_comment_edit(frm, index, menu_item_list);
				let child_tab_item = frm.doc.items
				child_tab_item.forEach(child_items => {
					if (menu_item_list.item_name === child_items.item_name) {
						$(`#${index}_input`).val(child_items.qty)
					}
				})

			})
		}
	},

	item_list_card: function (frm, index, menu_item_list) {
		rstnt_menu_items = `
	            <div class="col-lg-2 col-md-3 col-6 mr-0">
                    <div class="border border-light mb-4 mh-100 rounded text-center" id=${index} style="box-shadow: 0 0px 3px 0 rgba(0, 0, 0, 0.2);">
                        <div class="mt-3" style="padding: 0 13px;text-overflow: ellipsis;overflow:hidden;white-space:nowrap;width: 160px;">${menu_item_list.item_name}</div>
                        <div> ₹ ${menu_item_list.rate_of_item}</div>
                        <div class="d-none">${menu_item_list.special_dish_menu}</div>
                        <div class="d-flex " style="margin-bottom:10%;margin-top:10%;margin-left:8%;margin-right:8%;">
                            <div class="input-group">
                                <div class="input-group-prepend">
                                    <<button class="btn btn-secondary  rounded-0 shadow-none" style="margin-left:-21%;" id=${index + '_min'}> - </button>
                                    </div>
                                    <input class="form-control rounded-0 shadow-none text-center" style="height:36px;margin-right:-10px;margin-left:-12%;" id=${index + '_input'} value="0" readonly />
                                    <div class="input-group-append">
                                      <button class="btn btn-secondary rounded-0 shadow-none" style="margin-left:20%;" id=${index + '_add'}> + </button>
                                </div>
                            </div>                
                        </div>
                    </div>
                </div>`
		$('#restaurant_menu_items').append(rstnt_menu_items);
	},

	qty_comment_edit: function (frm, index, menu_item_list) {
		frm.page.wrapper.find('#' + index + '_input').on("click", function (evt) {
			frm.events.dialogApiForQtyCommentEdit(frm, index, menu_item_list);
		})
	},

	dialogApiForQtyCommentEdit: function (frm, index, menu_item_list) {
		let OrderItems = menu_item_list.item_code
		let names = menu_item_list.item_name
		var added = false;
		let d = new frappe.ui.Dialog({
			title: 'Enter details',
			fields: [
				{
					label: 'Quantity',
					fieldname: 'qty',
					fieldtype: 'Int',
					type: 'number',
					default: $(`#${OrderItems}_cartqty`).val()
				},
				{
					label: 'Comment',
					fieldname: 'comment',
					fieldtype: 'Data',
					default: $(`#${OrderItems}_comment`).val()
				}
			],
			primary_action_label: 'Add',
			primary_action(values) {
				d.hide();
				(frm.doc.items || []).forEach((d) => {
					if (
						d.item === OrderItems &&
						values.qty !== null &&
						values.qty !== undefined &&
						values.qty !== "" &&
						values.qty > 0
					) {
						d.qty = values.qty;
						const oldqty = $(`#${OrderItems}_cartqty`).val()
						$(`#${index}_input`).val(values.qty)
						$(`#${OrderItems}_cartqty`).val(`${d.qty}`);
						$(`#${OrderItems}_comment`).val(values.comment)
						d.comment = values.comment
						added = true;
						frappe.show_alert({
							message: __('Item Added Total Qty= ' + d.qty + ''),
							indicator: 'green'
						}, 0.85);

						const added_qty = d.qty - parseInt(oldqty)
						frm.events.calculate_total(frm, menu_item_list.rate_of_item, added_qty);
					}
				});
				return frappe.run_serially([
					() => {
						if (
							!added &&
							values.qty !== null &&
							values.qty !== undefined &&
							values.qty !== "" &&
							values.qty > 0
						) {
							$(`#${index}_input`).val(values.qty)
							frappe.show_alert({
								message: __('Item Added Total Qty= 1'),
								indicator: 'green'
							}, 0.85);

							frm.events.calculate_total(frm, menu_item_list.rate_of_item, values.qty);
							frm.events.createCartItem(frm, OrderItems, names, values.qty, values.comment);
							return frm.add_child('items', {
								item: OrderItems,
								item_name: names,
								qty: values.qty,
								comment: values.comment
							});
						}
					},
					() => frm.get_field("items").refresh()
				]);
			}
		});
		d.show();
	},

	quantity_add: function (frm, index, menu_item_list) {
		let OrderItems = menu_item_list.item_code;
		frm.page.wrapper.find('#' + index + '_add').on("click", function (evt) {
			let OrderItems = menu_item_list.item_code;
			let names = menu_item_list.item_name;
			var added = false;
			(frm.doc.items || []).forEach((d) => {
				if (d.item === OrderItems) {
					let qty = d.qty += 1;
					$(`#${index}_input`).val(d.qty);
					$(`#${OrderItems}_cartqty`).val(qty);
					added = true;
					frappe.show_alert({
						message: __('Item Added Total Qty= ' + d.qty + ''),
						indicator: 'green'
					}, 0.85);

					frm.events.calculate_total(frm, menu_item_list.rate_of_item, 1);
				}
			});

			return frappe.run_serially([
				() => {
					if (!added) {
						$(`#${index}_input`).val(1);
						frappe.show_alert({
							message: __('Item Added Total Qty= 1'),
							indicator: 'green'
						}, 0.85);

						frm.events.calculate_total(frm, menu_item_list.rate_of_item, 1);

						frm.events.createCartItem(frm, OrderItems, names, 1);
						return frm.add_child('items', {
							item: OrderItems,
							item_name: names,
							qty: 1
						});
					}
				},
				() => frm.get_field("items").refresh()
			]);
		});


		frm.page.wrapper.find('#' + OrderItems + '_cartqty').off("click").on("click", function (evt) {
			frm.events.dialogApiForQtyCommentEdit(frm, index, menu_item_list);
		});

		frm.page.wrapper.find('#' + OrderItems + '_remove').on("click", function (evt) {
			let OrderItems = menu_item_list.item_code;
			// Remove the item from frm.doc.items
			frm.doc.items = (frm.doc.items || []).filter((d) => d.item !== OrderItems);

			const qty = $(`#${OrderItems}_cartqty`).val()

			if (qty) {
				const negativeQty = qty * -1;
				frm.events.calculate_total(frm, menu_item_list.rate_of_item, negativeQty);

			}

			frm.refresh_field("items");
			$(`#${OrderItems}_container`).remove();
			$(`#${OrderItems}_qtyContainer`).remove();
			$(`#${OrderItems}_removeBtn`).remove()
		});

		frm.page.wrapper.find('#' + index + '_min').on("click", function (evt) {
			let OrderItems = menu_item_list.item_code;
			var removed = false;
			(frm.doc.items || []).forEach((d) => {
				if (d.item === OrderItems) {
					d.qty -= 1;
					$(`#${index}_input`).val(d.qty);
					if (d.qty < 1) {
						$(`#${index}_input`).val(0);
						d.qty = 0;
						removed = true;
					} else {
						frappe.show_alert({
							message: __('Item Quantity Reduced Total Qty= ' + d.qty + ''),
							indicator: 'green'
						}, 0.85);
						$(`#${OrderItems}_cartqty`).val(`${d.qty}`);
					}

					frm.events.calculate_total(frm, menu_item_list.rate_of_item, -1);
				}
			});

			let items = frm.doc.items || [];
			let new_items = [];

			for (let i = 0; i < items.length; i++) {
				if (items[i].qty !== 0) {
					new_items.push(items[i]);
				}
			}

			frm.set_value("items", new_items);
			frm.refresh_field("items");

			return frappe.run_serially([
				() => {
					frm.get_field("items").refresh();
					if (removed) {
						$(`#${OrderItems}_container`).remove();
						$(`#${OrderItems}_qtyContainer`).remove();
						$(`#${OrderItems}_removeBtn`).remove();
					}
				}
			]);
		});

	},

	createCartItem: function (frm, OrderItems, names, qty, comment) {
		let restaurantCartItemsList = $('#restaurantCartItemsList');
		if (restaurantCartItemsList.length === 0) {
			restaurantCartItemsList = $('<div id="restaurantCartItemsList" class="row"></div>');
			let heading = `
            <div class="col-6 py-3">
                <h5><strong>Item Name</strong></h5>
            </div>
            <div class="col-3 py-3">
                <h5><strong>Quantity</strong></h5>
            </div>
            <div class="col-3 py-3"></div>
            `;
			restaurantCartItemsList.append(heading);
			$('#restaurantCartItems').append(restaurantCartItemsList);
		}

		let itemDetails = `
            <div class="col-6 py-3" id="${OrderItems}_container">
                <h5>${names}</h5>
            </div>
            <div class="col-3 py-3" id="${OrderItems}_qtyContainer">
                <input class="input-with-feedback form-control text-center" style="background: var(--control-bg) !important" id="${OrderItems}_cartqty" value="${qty}" readonly/>
            </div>
            <input id="${OrderItems}_comment" class="d-none" value="${comment || ''}"></input>
            <div class="col-3 py-3" id="${OrderItems}_removeBtn">
                <button type="button" class="btn" id="${OrderItems}_remove">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-trash" viewBox="0 0 16 16">
                        <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5Zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5Zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6Z"></path>
                        <path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1ZM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118ZM2.5 3h11V2h-11v1Z"></path>
                    </svg>
                </button>
            </div>`;

		$(`#${OrderItems}_cartqty`).val(qty);
		restaurantCartItemsList.append(itemDetails);
	},

	get_menu: function (frm) {
		let search_input = frm.doc?.item_search ? frm.doc.item_search : undefined
		$('#restaurant_menu_items').empty()
		array_of_menu == [] ? frm.trigger('menu_listing') : ''
		if (search_input !== undefined) {
			if (array_of_menu.length > 0) {
				array_of_menu.map((menu_item_list, index) => {
					if ((menu_item_list.item_name.toLowerCase().indexOf(search_input != undefined ? search_input.toLowerCase() : undefined) !== -1) ||
						(menu_item_list.item_code.toLowerCase().indexOf(search_input != undefined ? search_input.toLowerCase() : undefined) !== -1)) {
						frm.events.item_list_card(frm, index, menu_item_list);
						frm.events.quantity_add(frm, index, menu_item_list);
						frm.events.qty_comment_edit(frm, index, menu_item_list);
						let child_tab_item = frm.doc.items
						child_tab_item.forEach(child_items => {
							if (menu_item_list.item_name === child_items.item_name) {
								$(`#${index}_input`).val(child_items.qty)
							}
						})
					}
				})
			}
		}
	},

	all_item: function (frm) {
		$("body").on('click', '.all_item', function (e) {
			// frm.trigger('menu_listing')
			frm.trigger('display_menu')
			$("[data-fieldname='item_search']").val('');
			$('.all_item').addClass('btn-outline-primary')
		})
	},

	priority_item: function (frm) {
		$("body").on('click', '.priority_item', function (e) {
			$('#restaurant_menu_items').empty()
			$("[data-fieldname='item_search']").val('');
			array_of_menu == [] ? frm.trigger('menu_listing') : ''
			if (array_of_menu.length > 0) {
				array_of_menu.map((menu_item_list, index) => {
					if (menu_item_list.special_dish_menu === 1) {
						frm.events.item_list_card(frm, index, menu_item_list);
						frm.events.quantity_add(frm, index, menu_item_list);
						frm.events.qty_comment_edit(frm, index, menu_item_list);
					}
				})
			} else {
				frm.trigger('display_menu');
			}
			$('.priority_item').addClass('btn-outline-primary')
		})
	},

	clear: function (frm) {
		frm.doc.customer_name = '';
		frm.doc.no_of_pax = '';
		frm.doc.add_item = '';
		frm.doc.grand_total = 0;
		frm.doc.items = [];
		frm.doc.modified_time = '';
		frm.refresh_field("customer_name");
		frm.refresh_field("no_of_pax");
		frm.refresh_field("modified_time")
	},

	restaurant_table: function (frm) {
		// to show selected table in the view
		const activeTable = document.createElement("div");
		activeTable.innerHTML = `<span style="margin-left:1.2rem;margin-top:3rem;font-size:16px;font-weight:600">${frm.doc.restaurant_table}</span>`;
		activeTable.style.color = "#1034A6"; // Set color to blue

		const existingSpans = document.querySelectorAll(".page-head-content span");
		existingSpans.forEach((span) => span.remove());

		const formPageDiv = document.querySelector(".page-head-content");
		formPageDiv.insertBefore(activeTable, formPageDiv.firstChild);


		// select the open sales order items for this table
		if (!frm.doc.restaurant_table) {
			return;
		}
		return frappe.call({
			method: 'ury.ury.doctype.ury_order.ury_order.get_order_invoice',
			args: {
				table: frm.doc.restaurant_table
			},
			callback: (r) => {
				frm.events.set_invoice_items(frm, r);
			}

		});

	},

	update_btn: async function (frm) {
		const check = localStorage.getItem('check');
		frm.disable_save();

		const handleUpdate = async () => {
			if (frm.doc.restaurant_table) {
				localStorage.setItem('check', 'printed');
				frm.remove_custom_button('Update');
				$('.standard-actions').addClass('hidden-xs hidden-md');

				if (frm.doc.pos_profile) {
					try {
						frm.trigger('sync');
						$('.standard-actions').removeClass('hidden-xs hidden-md');
						frm.doc.comments = '';
						localStorage.removeItem('check');
					}
					catch (error) {
						console.error(error);
					}
				} else {
					frappe.throw({
						message: __('POS Profile Not Found or User permission in POS Profile is not given to this user')
					});
				}
			} else {
				frappe.throw({
					message: __('Select Table')
				});
			}
		};

		if (frm.doc.last_invoice) {
			const pos_invoice = await frappe.db.get_doc('POS Invoice', frm.doc.last_invoice);
			if (pos_invoice.invoice_printed === 0 && !check) {
				frm.add_custom_button(__('Update'), handleUpdate);
			}
		} else {
			frm.add_custom_button(__('Update'), handleUpdate);
		}
	},


	sync: function (frm) {
		$('.custom-actions').addClass('hidden-xs hidden-md');
		if (frm.doc.customer_name && frm.doc.no_of_pax) {
			let last_invoice = ''
			if (frm.doc.last_invoice) {
				last_invoice = frm.doc.last_invoice
			}
			if ((frm.doc.items).length !== 0) {
				$('#ury-order-order_tab-tab').click();
				frappe.call({
					method: 'ury.ury.doctype.ury_order.ury_order.sync_order',
					args: {
						table: frm.doc.restaurant_table,
						items: frm.doc.items,
						mode_of_payment: "Cash",
						customer: frm.doc.customer_name,
						no_of_pax: frm.doc.no_of_pax,
						waiter: frappe.session.user,
						pos_profile: frm.doc.pos_profile,
						last_modified_time: frm.doc.modified_time,
						cashier: frm.doc.cashier,
						last_invoice: last_invoice,
						comments: frm.doc.comments,
					},
					callback: (r) => {
						let invoice = r.message;
						if (invoice.status == "Failure") {
							frappe.dom.freeze();
							document.addEventListener('click', function () {
								window.location.reload()
							});
						}
						else {
							cur_frm.set_value("modified_time", invoice.modified);
							frm.events.set_invoice_items(frm, r);
							frappe.show_alert({ message: __('Order Updated'), indicator: 'green' });
							localStorage.removeItem('check');
							frm.trigger('update_btn');
							$('.standard-actions').removeClass('hidden-xs hidden-md');
							frm.trigger('refresh');

						}
					}
				});
			}
			else {
				frm.trigger('update_btn');
				$('.standard-actions').removeClass('hidden-xs hidden-md');
				localStorage.removeItem('check');
				frappe.throw({
					message: __("Select Items")
				});
			}
		}
		else {
			frm.trigger('update_btn');
			$('.standard-actions').removeClass('hidden-xs hidden-md');
			localStorage.removeItem('check');
			frappe.throw({
				message: __("Select Customer / No of Pax")
			});
		}

	},

	print: function (frm) {
		frappe.db.get_doc('POS Invoice', frm.doc.last_invoice).then(pos_invoice => {
			if (pos_invoice.invoice_printed === 0) {
				frm.add_custom_button(__('Print'), () => {
					let invoice = frm.doc.last_invoice
					frappe.db.get_doc('POS Invoice', invoice).then(pos_invoice => {
						if (pos_invoice.invoice_printed == 1) {
							frappe.throw({
								title: __("Invoice Already Billed"),
								message: __("This order has already been billed. Please reload the page."),
								indicator: 'red'
							});
						}
						frappe.dom.freeze(__('Printing Invoice'));
						frappe.db.get_doc('POS Profile', pos_invoice.pos_profile).then(profile => {

							if (profile.qz_print == 1) {
								// To fetch qz_key from site config
								frappe.call({
									method: "ury.ury.api.ury_print.qz_certificate",
									callback: function (response) {
										if (response.message) {
											var qzKey = response.message;
											qz.security.setCertificatePromise(function (resolve, reject) {
												//Preferred method - from server
												fetch("/private/" + qzKey, { cache: 'no-store', headers: { 'Content-Type': 'text/plain' } })
													.then(function (data) { data.ok ? resolve(data.text()) : reject(data.text()); });
											});

										}
									}
								});

								frappe.call({
									method: "frappe.www.printview.get_html_and_style",
									args: {
										doc: "POS Invoice",
										name: invoice,
										print_format: profile.print_format,
										_lang: 'en',
									},
									callback: function (r) {
										if (qz.websocket.isActive()) {
											// Use the existing connection to print
											printWithQZTray();
										} else {
											// Establish a new connection and then print
											qz.websocket.connect({ host: profile.qz_host, usingSecure: false })
												.then(() => {
													// test();
													printWithQZTray();
												})
												.catch((error) => {
													// Handle connection error
													console.error("Error connecting to QZ Tray:", error);
													frappe.dom.unfreeze();
													frappe.throw({
														message: __("Printing Failed: Error connecting to QZ Tray")
													});
												});
										}
										function printWithQZTray() {
											qz.printers.getDefault()
												.then((printer) => {
													var htmlcontent = r.message.html;
													var data = [{
														type: 'html',
														format: 'plain',
														data: htmlcontent
													}];

													var config = qz.configs.create(printer);
													qz.print(config, data)
														.then(function () {
															frappe.call({
																method: `ury.ury.api.ury_print.qz_print_update`,
																args: {
																	invoice: invoice
																},
																callback: function (r) {
																}
															});
															frappe.dom.unfreeze();
															frappe.show_alert({ message: __('Invoice Printed'), indicator: 'green' });
															$('.standard-actions').addClass('hidden-xs hidden-md');
															frappe.ui.toolbar.clear_cache()
															document.addEventListener('click', function () {
																frappe.ui.toolbar.clear_cache()
															});
														})
														.catch(function (error) {
															// Handle printing error
															console.error("Error printing with QZ Tray:", error);
															frappe.dom.unfreeze();
															frappe.throw({
																message: __("Printing Failed: Error printing with QZ Tray")
															});
														});
												})
												.catch(function (error) {
													// Handle printer lookup error
													console.error("Error looking up printer:", error);
													frappe.dom.unfreeze();
													frappe.throw({
														message: __("Printing Failed: Error looking up printer")
													});
												});
										}
									},
								});
							}

							else if (profile.printer_settings.some(e => e.bill == 1)) {
								frappe.call({
									method: `ury.ury.api.ury_print.select_network_printer`,
									args: {
										pos_profile: pos_invoice.pos_profile,
										invoice_id: invoice
									},
									callback: function (r) {
										if (r.message == "Success") {
											$('.standard-actions').addClass('hidden-xs hidden-md');
											frappe.show_alert({ message: __('Invoice Printed'), indicator: 'green' });
											setTimeout(function () {
												frappe.dom.unfreeze();
												frappe.ui.toolbar.clear_cache()
											}, 1500)
										}
										else {
											console.error(r.message);
											frappe.dom.unfreeze();
											frappe.throw({
												message: __("Printing Failed")
											});
										}
									},
									error: function (xhr, textStatus, error) {
										console.error("AJAX Error:", error); // Log the AJAX error
										frappe.dom.unfreeze();
										frappe.throw({
											message: __("An error occurred while printing")
										});
									}
								})

							}
							else {
								frappe.call({
									method: `ury.ury.api.ury_print.print_pos_page`,
									args: {
										doctype: "POS Invoice",
										name: invoice,
										print_format: profile.print_format
									},
									callback: function (r) {
										$('.standard-actions').addClass('hidden-xs hidden-md');
										frappe.ui.toolbar.clear_cache()
										frappe.dom.unfreeze();
									}
								});

							}
						})
					})
				}).addClass("print-btn");
			}
		})
	},

	set_invoice_items: function (frm, r) {

		let invoice = r.message;

		if (invoice.name) {
			if (frm.doc.pos_profile) {
				frappe.call({
					method: 'frappe.client.get',
					args: {
						doctype: 'POS Profile',
						name: frm.doc.pos_profile
					},
					callback: function (response) {
						if (response.message) {
							var transfer_roles = response.message.transfer_role_permissions.map(role => role.role);
							var user_roles = frappe.user_roles;
							var has_access = transfer_roles.some(role => user_roles.includes(role));
							if (has_access == false) {
								if (invoice.waiter && invoice.waiter != frappe.session.user) {
									frappe.db.get_doc('User', invoice.waiter)
										.then(docs => {
											frappe.dom.freeze();
											document.addEventListener('click', function () {
												window.location.reload();
											});
											frappe.throw({
												title: __("Table Assignment Error"),
												message: __("This table is assigned to {0}. Please contact them for assistance.", [docs.full_name])

											})
										})
								}
								else {
									frappe.show_alert({
										message: __('Past Order Fetched'),
										indicator: 'green'
									}, 5);
								}
							}
						}
					}
				})
			}
			else {
				frappe.throw({
					title: __("Validation Error"),
					message: __("POS Profile Failed to Load")

				})
			}
		}
		else {
			frm.trigger('clear');
		}
		frappe.dom.freeze(__('Setting table'));

		frm.doc.items = [];
		(invoice.items || []).forEach((d) => {
			frm.add_child('items', { item: d.item_code, item_name: d.item_name, qty: d.qty, rate: d.rate });
		});

		frm.set_value('customer_name', invoice.customer);
		frm.set_value('pos_profile', invoice.pos_profile);
		frm.set_value('no_of_pax', invoice.no_of_pax);
		frm.set_value('grand_total', invoice.grand_total);
		frm.set_value('last_invoice', invoice.name);
		frm.set_value('modified_time', invoice.modified);

		if (frm.doc.customer_name) {
			frm.trigger('favourite')
		}

		const tabToClick = frm.doc.last_invoice ? '#ury-order-order_tab-tab' : '#ury-order-menu_tab-tab';
		$(tabToClick).click();

		if (frm.doc.last_invoice) {
			frappe.db.get_doc('POS Invoice', frm.doc.last_invoice).then(invoice => {
				invoice.items.forEach(item => {
					frm.events.createCartItem(frm, item.item_code, item.item_name, item.qty);

				});
			});
			frm.trigger('menu_listing')
		}
		frm.refresh();
		frappe.dom.unfreeze();
	},

	table_transfer: function (frm) {
		frm.add_custom_button(__('Table Transfer'), () => {
			frappe.db.get_doc('POS Invoice', frm.doc.last_invoice).then((pos_invoice) => {
				if (pos_invoice.invoice_printed === 1) {
					frappe.throw({
						title: __("Invoice Already Billed"),
						message: __("This order has already been billed. Please reload the page."),
						indicator: 'red'
					});
				}

				else {
					const d = new frappe.ui.Dialog({
						title: 'Transfer Table',
						fields: [
							{
								label: 'New Table',
								fieldname: 'table',
								fieldtype: 'Link',
								options: 'URY Table',
								get_query: function () {
									return { filters: { "occupied": 0 } };
								}
							},
							{
								label: 'Current Table',
								fieldname: 'cur_table',
								fieldtype: 'Data',
								read_only: true,
								default: frm.doc.restaurant_table
							}
						],
						primary_action_label: 'Transfer',
						primary_action(values) {
							frappe.dom.freeze();
							frm.call({
								method: 'ury.ury.doctype.ury_order.ury_order.table_transfer',
								args: {
									invoice: frm.doc.last_invoice,
									table: frm.doc.restaurant_table,
									newTable: values.table
								},
								callback: function (r) {
									frm.trigger('clear');
									// Reload the page
									window.location.reload();
								}
							});
							d.hide();
						}
					});
					d.show();
				}

			});
		})
	},

	captain_transfer: function (frm) {
		let invoice = frm.doc.last_invoice
		if (invoice) {
			frappe.call({
				method: 'frappe.client.get',
				args: {
					doctype: 'POS Profile',
					name: frm.doc.pos_profile
				},
				callback: function (response) {
					var transfer_roles = response.message.transfer_role_permissions.map(role => role.role);
					var user_roles = frappe.user_roles
					var has_access = transfer_roles.some(role => user_roles.includes(role));
					if (has_access) {
						frm.add_custom_button(__('Captain Transfer'), () => {
							frappe.db.get_doc('POS Invoice', invoice).then(pos_invoice => {
								if (pos_invoice.invoice_printed === 1) {
									frappe.throw({
										title: __("Invoice Already Billed"),
										message: __("This order has already been billed. Please reload the page."),
										indicator: 'red'
									});
								}
								else {
									let d = new frappe.ui.Dialog({
										title: 'Transfer Captain',
										fields: [
											{
												label: 'New Captain',
												fieldname: 'captain',
												fieldtype: 'Link',
												options: 'User',
											},
											{
												label: 'Current Captain',
												fieldname: 'cur_captain',
												fieldtype: 'Data',
												read_only: true,
												default: pos_invoice.waiter
											}

										],
										primary_action_label: 'Transfer',
										primary_action(values) {
											frappe.dom.freeze();
											frm.call({
												method: 'ury.ury.doctype.ury_order.ury_order.captain_transfer',
												args: {
													invoice: frm.doc.last_invoice,
													currentCaptain: frm.doc.waiter,
													newCaptain: values.captain
												},
												callback: function (r) {
													frm.trigger('clear');
													window.location.reload();
													document.addEventListener('click', function () {
														window.location.reload();
													});

												}
											});
											d.hide();
										}
									});
									d.show();
								}
							});
						});
					}


				}
			});
		}
	},

	cancel_order: function (frm) {
		frappe.call({
			method: 'ury.ury.api.button_permission.cancel_check',
			callback: function (r) {
				if (r.message == true) {
					frm.add_custom_button(__('Cancel'), () => {
						frappe.db.get_doc('POS Invoice', frm.doc.last_invoice).then((pos_invoice) => {
							if (pos_invoice.invoice_printed === 1) {
								frappe.throw({
									title: __("Invoice Already Billed"),
									message: __("Not allowed to cancel billed orders."),
									indicator: 'red'
								});
							}
							else {
								let cancelFlag = false;

								var dialog = new frappe.ui.Dialog({
									title: __("Confirm Cancellation"),
									fields: [
										{
											fieldname: 'reason',
											fieldtype: 'Data',
											label: __('Reason'),
											reqd: 1
										}
									],
									primary_action: function () {
										var reason = dialog.get_value('reason');
										if (!cancelFlag) {
											cancelFlag = true;
											frm.reason = reason;
											frm.cancel_reason = reason;
											frm.trigger('cancel');
											dialog.hide();
										}
									},
									primary_action_label: __('Cancel'),
								});

								dialog.show();
							}

						});
					}).addClass("cancel-btn");
				}

			}
		})

	},

	cancel: function (frm) {
		frm.call({
			method: 'ury.ury.doctype.ury_order.ury_order.cancel_order',
			args: {
				invoice_id: frm.doc.last_invoice,
				reason: frm.cancel_reason
			},
			callback: function (r) {
				frappe.show_alert({ message: __('Cancelled'), indicator: 'red' });
				setTimeout(function () {
					window.location.reload();
				}, 1000)
			}
		});

	},

	favourite: function (frm) {
		let customerFavItems = '';

		$('#fav_items').empty();

		if (frm.doc.customer_name) {
			frappe.call({
				method: 'ury.ury.doctype.ury_order.ury_order.customer_favourite_item',
				args: {
					customer_name: frm.doc.customer_name
				},
				callback: function (r) {
					r.message.map((x) => {
						customerFavItems = `
							<div class="col-6 py-3" style="padding: 0 15px; width: 250px;">
								${x["item_name"]}
							</div>
							<div class="col-3 py-3">
								${x["qty"]}
							</div>
						`;

						if (!$('#fav_items').html().includes(customerFavItems)) {
							// Check if the item is not already in the HTML content
							$('#fav_items').append(customerFavItems);
						}
					});
				}
			});
		}
	}

});

