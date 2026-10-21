frappe.ui.form.on('URY Order', {
	onload:function(frm) {
        try{
            let s_user = frappe.session.user;
            frm.doc.waiter = s_user
    	    frappe.db.get_list('Employee',{fields:['name','branch','user_id'], limit:10000})
    	    .then(doce=> {
    	        doce.map((val)=>{
    	            if(val.user_id == s_user){
    	                branch_g=val.branch
    	                let branch = val.branch;
    	                frappe.db.get_list('POS Profile',{fields:['name','branch']})
                        .then(docp=> {
                            docp.map((val)=>{
                                if(val.branch == branch){
                                    frm.set_value("pos_profile",val.name);
                                    frappe.dom.freeze();
                                    frappe.call({
                                        method: `ury.ury.hooks.order_taking.ordertaker_checklist`,
                                        args: {
                                            branch:branch,
                                            employee:s_user
                                        },
                                        callback: function(r) {
                                            console.log(r)
                                            if(r.message[0] === 0)
                                            {
                                                frappe.dom.unfreeze();
                                            }
                                            else{
                                                let url = r.message[1]
                                                document.addEventListener('click', function() {
                                                    window.location.href = '/app'
                                                });
                                            }
                                        }
                                    });
                                }
                            })
                        });
    	            }
    	        });
    	    });
    	}
        catch(err){
        }
	},
})
