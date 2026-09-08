frappe.ui.form.on('POS Invoice', {
	refresh(frm) {
	    if (cur_frm.doc.customer_group && !cur_frm.doc.__islocal){
	        cur_frm.customer_group = cur_frm.doc.customer_group
	    }
	    else{
	        cur_frm.customer_group = "unset"
	    }
    },
    customer_group: function(frm){
        if(cur_frm.customer_group != "unset"){
            if(cur_frm.customer_group != cur_frm.doc.customer_group){
                frappe.dom.freeze();
                frappe.msgprint({
                    'title': 'Message',
                    'message': 'Customer Group cannot be changed',
                    'indicator': 'red'
                });
                document.addEventListener('click', function() {
                    window.location.reload();
                });
            }
        }
    }
})
