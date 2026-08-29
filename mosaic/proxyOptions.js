import fs from 'node:fs';
import path from 'node:path';

const configPath = path.resolve(process.cwd(), '../../../sites/common_site_config.json');
const commonSiteConfig = fs.existsSync(configPath)
	? JSON.parse(fs.readFileSync(configPath, 'utf8'))
	: {};
const webserver_port = commonSiteConfig.webserver_port || 8000;

export default {
	'^/(app|api|assets|files)': {
		target: `http://localhost:${webserver_port}`,
		ws: true,
		router: function(req) {
			const site_name = req.headers.host.split(':')[0];
			return `http://${site_name}:${webserver_port}`;
		}
	}
};
