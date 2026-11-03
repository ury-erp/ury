import { config } from "@vue/test-utils";
import i18n from "../i18n";

// Components use the global `__()` helper installed by main.js.
config.global.plugins = [i18n];
