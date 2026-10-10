frappe.ui.form.on('URY Website', {
  refresh(frm) {
    if (!frm.is_new()) {
      frm.add_custom_button(__('Preview Website'), () => {
        window.open(`/restaurant?slug=${encodeURIComponent(frm.doc.slug)}&preview=1`, '_blank', 'noopener');
      });
      if (frm.doc.published) {
        frm.add_custom_button(__('Open Website'), () => {
          window.open(`/restaurant?slug=${encodeURIComponent(frm.doc.slug)}`, '_blank', 'noopener');
        });
      }
    }
  },
});
