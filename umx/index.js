function readFile(fileName) {
    const reader = new FileReader();
    reader.onerror = function() {
        error('An error occurred when readin the file. Error code: ' + reader.error.code); 
    };

    reader.onload = function() {
        const arrayBuffer = reader.result;  // Get ArrayBuffer
        info(file.name + "Was loaded. Decoding."); //を読み込みました。デコードしています。
        decode(file.name, arrayBuffer);
    };

    reader.readAsArrayBuffer(fileName);
}