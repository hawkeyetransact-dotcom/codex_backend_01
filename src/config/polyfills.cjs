const { Blob } = require("buffer");

if (typeof globalThis.Blob === "undefined") {
  globalThis.Blob = Blob;
}

if (typeof globalThis.File === "undefined") {
  class File extends Blob {
    constructor(chunks, name = "", options = {}) {
      super(chunks, options);
      this.name = String(name || "");
      this.lastModified = options.lastModified || Date.now();
    }
  }
  globalThis.File = File;
}
