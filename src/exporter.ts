import '@logseq/libs';
import { saveAs } from 'file-saver';
import JSZip, { file } from 'jszip';

let zip = new JSZip;
let fileTracker = [];

function resetExporter() {
    zip = new JSZip();
    fileTracker = [];
}

export async function addPageToZip(fileName, data) {
    fileTracker.push(fileName);
    let slug = slugForFile(fileName);
    await zip.file(
        `pages/${slug}.md`,
        data
    );
}

function slugForFile(fileName) {
    return fileName.replaceAll(
        /([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g,
        ""
    );
}

export async function addImageToZip(filePath) {
    var element = document.createElement("img");
    let formattedFilePath = filePath.replace("..", path);
    element.setAttribute("src", formattedFilePath);
    element.style.display = "none";

    document.body.appendChild(element);
    setTimeout(async () => {
        var base64 = getBase64Image(element);
        document.body.removeChild(element);
        if (base64 != "data:,") {
            await zip.file(
                "assets/" +
                filePath.split("/")[filePath.split("/").length - 1].toLowerCase(),
                base64,
                { base64: true }
            );
            fileTracker.push(filePath);
        } else {
            // console.log(base64);
        }
    }, 100);
}

function getBase64Image(img) {
    var canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    var ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    var dataURL = canvas.toDataURL("image/png");
    return dataURL.replace(/^data:image\/(png|jpg);base64,/, "");
}

export async function downloadZip() {
    console.log('DownloadZip');
    console.log(zip);

    zip.generateAsync({type: "blob"}).then(function (content) {
        // see FileSaver.js
        saveAs(content, "publicExport.zip");
    });
    resetExporter();
}

