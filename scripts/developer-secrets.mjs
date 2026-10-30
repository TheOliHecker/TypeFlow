// Run locally. Reads the password from a hidden terminal prompt; never saves it.
import { randomBytes, scryptSync } from "node:crypto";
import { stdin, stdout } from "node:process";
if (!stdin.isTTY)
  throw new Error("Use an interactive terminal for hidden password entry.");
stdout.write("New developer password (at least 16 characters): ");
stdin.setRawMode(true);
stdin.resume();
let password = "";
stdin.on("data", (chunk) => {
  for (const char of chunk.toString()) {
    if (char === "\u0003") {
      stdin.setRawMode(false);
      process.exit(130);
    }
    if (char === "\r" || char === "\n") {
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
      if (password.length < 16) {
        console.error("Use at least 16 characters.");
        process.exit(1);
      }
      const salt = randomBytes(16).toString("hex");
      const hash = scryptSync(password, salt, 64).toString("hex");
      password = "";
      console.log(`TYPEFLOW_DEVELOPER_PASSWORD_HASH=scrypt:${salt}:${hash}`);
      console.log(
        `TYPEFLOW_DEVELOPER_SESSION_SECRET=${randomBytes(48).toString("base64url")}`,
      );
      process.exit(0);
    }
    if (char === "\u007f" || char === "\b") password = password.slice(0, -1);
    else if (char >= " ") password += char;
    if (password.length > 1024) {
      stdin.setRawMode(false);
      process.exit(1);
    }
  }
});
