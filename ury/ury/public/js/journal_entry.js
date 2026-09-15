frappe.ui.form.on('Journal Entry', {
	refresh:function(frm){
	    if (frm.doc.docstatus === 0){
	        frm.trigger("add_cost_center")
	    }
	},
	branch:function(frm) {
	    frm.trigger("add_cost_center")
	},
	add_cost_center:function(frm) {
	    let branch = frm.doc.branch
	    frappe.db.get_list('Cost Center',{fields:['name','branch']}).then(docp=> {
	        docp.map((val)=>{
	            if(branch && val.branch == branch){
	                $.each(frm.doc.accounts || [],function(i,v){
	                    frappe.model.set_value(v.doctype, v.name, "cost_center", val.name);
	                })
	                frm.refresh_field("accounts");
	            }
	        })
	    });
	}
})
frappe.ui.form.on('Journal Entry Account', {
	accounts_add:function(frm,cdt,cdn) {
	    let branch = frm.doc.branch
	    frappe.db.get_list('Cost Center',{fields:['name','branch']}).then(docp=> {
	        docp.map((val)=>{
	            if(branch && val.branch == branch){
	                $.each(frm.doc.accounts || [],function(i,v){
	                    frappe.model.set_value(v.doctype, v.name, "cost_center", val.name);
	                })
	                frm.refresh_field("accounts");
	            }
	        })
	    });
	}
})
