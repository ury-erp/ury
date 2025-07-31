import { FrappeApp } from "frappe-js-sdk";

let host = window.location.hostname;
let port = window.location.port;
let protocol = window.location.protocol;
let url = port ? `${protocol}//${host}:${port}` : `${protocol}//${host}:${port}`;

export const frappe = new FrappeApp(url);

export default frappe;
