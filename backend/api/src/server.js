import { app } from "./app.js";

const port = process.env.PORT || 8787;
app.listen(port, () => {
  console.log(`AdorWorks API listening on :${port}`);
});
