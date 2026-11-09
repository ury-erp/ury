frappe.listview_settings['URY Print Job'] = {
    add_fields: ["status"],
    get_indicator: function(doc) {
        const indicator_map = {
            'COMPLETED': [__('Completed'), 'green', 'status,=,COMPLETED'],
            'PROCESSING': [__('Processing'), 'blue', 'status,=,PROCESSING'],
            'QUEUED': [__('Queued'), 'yellow', 'status,=,QUEUED'],
            'PENDING': [__('Queued'), 'yellow', 'status,=,QUEUED'],
            'SUBMITTED': [__('Submitted'), 'yellow', 'status,=,SUBMITTED'],
            'FAILED': [__('Failed'), 'red', 'status,=,FAILED'],
            'CANCELED': [__('Canceled'), 'red', 'status,=,CANCELED'],
            'CANCELLED': [__('Cancelled'), 'red', 'status,=,CANCELLED']
        };
        return indicator_map[doc.status] || [__(doc.status || 'Unknown'), 'gray', ''];
    }
};
