import http from "http";
http.get("http://144.31.181.179:3000/assets/index-6Qwf0ndM.js", (res) => {
  console.log("Status:", res.statusCode);
  console.log("Content-Type:", res.headers["content-type"]);
  let data = "";
  res.on("data", chunk => {
    data += chunk;
    if(data.length > 500) { res.destroy(); console.log(data.slice(0, 500)); }
  });
}).on("error", console.error);
