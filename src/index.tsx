import "@logseq/libs";
import "./exporter";
import {addPageToZip, downloadZip} from "./exporter";
import {getAllPublicPages} from "./generator";

/**
 * entry
 */
function main () {
    console.log('Plugin markdown-export loaded.');

    // logseq.App.registerUIItem("toolbar", {
    //     key: "export-markdown",
    //     template: `
    //   <a class="button" data-on-click="show" data-rect>
    //     <i class="ti ti-file-zip"></i>
    //   </a>
    // `,
    // });

    logseq.Editor.registerSlashCommand(
        'Markdown Export',
        async () => {
            let settings = {};
            logseq.App.showMsg(`Exporting graph`);
            await exportAsMarkdown(settings);
        },
    )

}

async function exportAsMarkdown(settings) {
    console.log("settings:" + JSON.stringify(settings));
    await getAllPublicPages();
    downloadZip();
}

// bootstrap
logseq.ready(main).catch(console.error)
