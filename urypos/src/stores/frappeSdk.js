import { FrappeApp } from "frappe-js-sdk";
let url = window.location.origin;
export const frappe = new FrappeApp(url);
export default frappe;
