var fs = require('fs');  
var original = fs.readFileSync('electron/main.ts', 'utf8');  
var fixed = original;  
