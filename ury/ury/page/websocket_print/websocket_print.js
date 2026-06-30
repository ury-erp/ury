frappe.pages['websocket-print'].on_page_load = function (wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Websocket Print',
		single_column: true
	});
	frappe.call({
		method: 'ury.ury_pos.api.getBranch',
		callback: function (r) {
			const branch = r.message;
			const print_channel = `print_${branch}`;
			frappe.realtime.on(print_channel, (data) => {
				if (!(data.data.name in localStorage)) {
					get_print_html(set_preview, wrapper, data.data.doctype, data.data.name, data.data.print_format)
					localStorage.setItem(data.data.name, '')
				}
			})
		}
	})

}

frappe.pages['websocket-print'].refresh = function (wrapper) {
}

let get_print_html = function (set_preview, wrapper, doc, name, print_format) {
	this._req = frappe.call({
		method: "frappe.www.printview.get_html_and_style",
		args: {
			doc: doc,
			name: name,
			print_format: print_format,
			_lang: 'en',
		},
		callback: function (r) {
			set_preview(r, wrapper);
		},
	});
};

const set_preview = function (val = null, wrapper) {
	let print_wrapper = $(wrapper).find('.layout-main-section');
	let html = val.message.html;
	//create ifram
	const iframe = document.createElement('iframe');
	iframe.id = 'print_content';

	document.body.appendChild(iframe)

	iframe.contentWindow.document.open()
	iframe.contentWindow.document.write(html)
	iframe.contentWindow.document.close()

	// print_wrapper.html(iframe)
	console.log(val.message.html)
	iframe.contentWindow.print();
	iframe.parentNode.removeChild(iframe);
}