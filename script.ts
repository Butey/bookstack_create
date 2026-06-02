import { JSDOM } from 'jsdom';
const dom = new JSDOM('', {
    url: "http://localhost:3000/",
    runScripts: "dangerously",
    resources: "usable"
});

dom.window.onerror = function(msg, url, lineNo, columnNo, error) {
    console.error("Window Error: ", msg, error);
}

// wait a bit
setTimeout(() => {
    console.log("HTML:", dom.window.document.body.innerHTML.substring(0, 500));
}, 3000);
