import '@logseq/libs';
import {hugoDate} from "./utils";
import {BlockEntity, PageEntity, SettingSchemaDesc} from '@logseq/libs/dist/LSPlugin';
import {addImageToZip, addPageToZip }  from "./exporter";

let allPublicPages;
let allPublicLinks = [] //list of all exported pages

export async function getAllPublicPages() {
    //needs to be both public, and a page (with a name)
    // const query =
    //   "[:find (pull ?p [*]) :where [?p :block/properties ?pr] [(get ?pr :public) ?t] [(= true ?t)][?p :block/name ?n]]";
    //   "[:find (pull ?p [*]) :where [?p :block/name ?n]]";
    // NLT get all pages

    const query =
        "[:find (pull ?p [*]) :where [?p :block/name ?n]]";

    // NLT change this to get all pages where public is NOT false
    // const query =
    //    "[:find (pull ?p [*]) :where [?p :block/properties ?pr] [(get ?pr :public) ?t] [(!= false ?t)][?p :block/name ?n]]";

    console.log("getting all non private pages.");

    allPublicPages = await logseq.DB.datascriptQuery(query);
    allPublicPages = await allPublicPages?.flat();

    for (const x of allPublicPages) {
        allPublicLinks.push(x["original-name"].toLowerCase())
        console.log(x["original-name"].toLowerCase());
    }

    for (const x in allPublicPages) {
        let curPage = allPublicPages[x];
        let pageData = await getBlocksInPage({page: curPage});
        await addPageToZip(curPage["original-name"], pageData);
    }
}

export async function getBlocksInPage (
    e,
    tagsArray = [],
    dateArray = [],
    titleDetails = [],
    categoriesArray = []
) {
    //if e.page.originalName is undefined, set page to equal e.page.original-name
    let curPage = e.page;
    console.log('page');
    if (curPage.originalName != undefined) {
        curPage["original-name"] = curPage.originalName;
    }

    const docTree = await logseq.Editor.getPageBlocksTree(
        curPage["original-name"]
    );

    const metaData = await parseMeta(
        e,
        tagsArray,
        dateArray,
        titleDetails,
        categoriesArray
    );

    // parse page-content
    let finalString = await parsePage(metaData, docTree);
    return finalString;
}

//parse files meta-data
async function parseMeta(
    curPage,
    tagsArray = [],
    dateArray = [],
    titleDetails = [],
    categoriesArray = []
) {
    let propList = [];

    console.log(curPage.page);

    //get all properties - fix later
    if (curPage?.page?.properties != undefined) {
        propList = curPage?.page.properties;
    }
    //Title
    //FIXME is filename used?
    propList.title = curPage.page["original-name"];
    if (titleDetails.length > 0) {
        propList.title = titleDetails[0].noteName;
        propList.fileName = titleDetails[1].hugoFileName;
    }

    //Tags
    propList.tags = curPage?.page?.properties?.tags
        ? curPage?.page.properties.tags
        : [];
    if (tagsArray != []) {
        let formattedTagsArray = [];
        for (const tag in tagsArray) {
            formattedTagsArray.push(tagsArray[tag].tags);
        }
        if (propList.tags != undefined) {
            for (const tag in formattedTagsArray) {
                propList.tags.push(formattedTagsArray[tag]);
            }
        } else {
            propList.tags = formattedTagsArray;
        }
    }

    //Categories - 2 possible spellings!
    const tmpCat = curPage?.page?.properties?.category
        ? curPage?.page.properties.category
        : [];
    propList.categories = curPage?.page?.properties?.categories
        ? curPage?.page.properties.categories
        : tmpCat;
    if (categoriesArray != []) {
        let formattedCategoriesArray = [];
        for (const category in categoriesArray) {
            formattedCategoriesArray.push(categoriesArray[category].category);
        }
        if (propList.categories != undefined) {
            for (const category in formattedCategoriesArray) {
                propList.categories.push(formattedCategoriesArray[category]);
            }
        } else {
            propList.categories = formattedCategoriesArray;
        }
    }

    //Date - if not defined, convert Logseq timestamp
    propList.date = curPage?.page?.properties?.date
        ? curPage?.page.properties.date
        : hugoDate(curPage.page["created-at"]);
    propList.lastMod = curPage?.page?.properties?.lastmod
        ? curPage?.page.properties.lastmod
        : hugoDate(curPage.page["updated-at"]);
    if (dateArray.length > 0) {
        propList.date = dateArray[1].originalDate;
        propList.lastMod = dateArray[0].updatedDate;
    }

    //these properties should not be exported to Hugo
    const nope = ["filters", "public"]
    for (const nono of nope) {
        delete propList[nono]
    }

    //convert propList to Hugo yaml
    // https://gohugo.io/content-management/front-matter/
    let ret = `---`;
    for (let [prop, value] of Object.entries(propList)) {
        if (Array.isArray(value)) {
            ret += `\n${prop}:`;
            value.forEach((element) => (ret += `\n- ${element}`));
        } else {
            ret += `\n${prop}: ${value}`;
        }
    }
    ret += "\n---";
    return ret;
}

async function parsePage(finalString: string, docTree) {
    // console.log("DB parsePage")
    for (const x in docTree) {
        // skip meta-data
        if (!(parseInt(x) === 0 && docTree[x].level === 1)) {

            //parseText will return 'undefined' if a block skipped
            const ret = await parseText(docTree[x])
            if (typeof ret != "undefined") {
                finalString = `${finalString}\n${ret}`;
            }

            if (docTree[x].children.length > 0)
                finalString = await parsePage(finalString, docTree[x].children);
        }
    }
    return finalString;
}

function parseLinks(text: string, allPublicPages) {
    //returns text with all links converted

    // conversion of links to hugo syntax https://gohugo.io/content-management/cross-references/
    // Two kinds of links: [[a link]]
    //                     [A description]([[a link]])
    // Regular links are done by Hugo [logseq](https://logseq.com)
    const reLink: RegExp = /\[\[(.*?)\]\]/gmi
    const reDescrLink: RegExp = /\[([a-zA-Z ]*?)\]\(\[\[(.*?)\]\]\)/gmi

    // FIXME why doesn't this work?
    // if (! reDescrLink.test(text) && ! reLink.test(text)) return text

    let result
    while (result = (reDescrLink.exec(text) || reLink.exec(text))) {
        if (allPublicLinks.includes(result[result.length - 1].toLowerCase())) {
            text = text.replace(result[0], `[${result[1]}]({{< ref "/pages/${result[result.length - 1]}" >}})`)
        }
    }
    if (logseq.settings.linkFormat == "Without brackets") {
        text = text.replaceAll("[[", "");
        text = text.replaceAll("]]", "");
    }
    return text
}

async function parseNamespaces(text: string, blockLevel: number) {
    const namespace: RegExp = /{{namespace\s([^}]+)}}/gmi

    let result
    while (result = (namespace.exec(text))) {
        const currentNamespaceName = result[result.length - 1];

        const query =
            `[:find (pull ?c [*]) :where [?p :block/name "${currentNamespaceName.toLowerCase()}"] [?c :block/namespace ?p]]`;
        let namespacePages = await logseq.DB.datascriptQuery(query);
        namespacePages = namespacePages?.flat(); //FIXME is this needed?

        let txtBeforeNamespacePage: string = "";
        if (logseq.settings.bulletHandling == "Convert Bullets") {
            txtBeforeNamespacePage = " ".repeat(blockLevel * 2) + "+ ";
        }

        let namespaceContent = `**Namespace [[${currentNamespaceName}]]**\n\n`;
        if (allPublicLinks.includes(currentNamespaceName.toLowerCase())) {
            namespaceContent = namespaceContent.replace(`[[${currentNamespaceName}]]`, `[${currentNamespaceName}]({{< ref "/pages/${currentNamespaceName}" >}})`);
        }

        for (const page of namespacePages) {
            const pageOrigName = page["original-name"];
            if (allPublicLinks.includes(page["original-name"].toLowerCase())) {
                const pageName = pageOrigName.replace(`${currentNamespaceName}/`, "");
                namespaceContent = namespaceContent.concat(txtBeforeNamespacePage + `[${pageName}]({{< ref "/pages/${pageOrigName}" >}})\n\n`);
            }
        }

        text = text.replace(result[0], namespaceContent);
    }

    return text;
}

async function parseText(block: BlockEntity) {
    //returns either a hugo block or `undefined`
    let re: RegExp;
    let text = block.content;
    // console.log("block", block)
    let txtBefore: string = "";
    let txtAfter: string = "\n";
    const prevBlock: BlockEntity = await logseq.Editor.getBlock(block.left.id, {
        includeChildren: false,
    });

    //Block refs - needs to be at the beginning so the block gets parsed
    //FIXME they need some indicator that it *was* an embed
    const rxGetId = /\(\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)\)/;
    const rxGetEd = /{{embed \(\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)\)}}/;
    const blockId = (rxGetEd.exec(text) || rxGetId.exec(text))
    if (blockId != null) {
        const block = await logseq.Editor.getBlock(blockId[1], {
            includeChildren: true,
        });

        if (block != null) {
            // console.log("DB blockId", blockId)
            text = text.replace(
                blockId[0],
                block.content.substring(0, block.content.indexOf("id::"))
            )
        }
    }

    //task markers - skip
    if (block.marker && !logseq.settings.exportTasks) return

    //Images
    //FIXME ![image.png](../assets/image_1650196318593_0.png){:class medium, :height 506, :width 321}
    //Logseq has extra info: height and width that can be used in an image template
    //Get regex to check if text contains a md image
    const reImage = /!\[.*?\]\((.*?)\)/g;
    try {
        text.match(reImage).forEach((element) => {
            element.match(/(?<=!\[.*\])(.*)/g).forEach((match) => {
                let finalLink = match.substring(1, match.length - 1);
                // return (match.substring(1, match.length - 1))
                text = text.replace(match, match.toLowerCase());
                if (!finalLink.includes("http") || !finalLink.includes(".pdf")) {
                    text = text.replace("../", "/");
                    addImageToZip(finalLink);
                }
            });
        });
    } catch (error) {
    }

    // FIXME for now all indention is stripped out
    // Add indention — level zero is stripped of "-", rest are lists
    // Experiment, no more lists, unless + or numbers
    // (unless they're not)
    if (logseq.settings.bulletHandling == "Convert Bullets") {
        if (block.level > 1) {
            txtBefore = " ".repeat((block.level - 1) * 2) + "+ ";
            // txtBefore = "\n" + txtBefore
            if (prevBlock.level === block.level) txtAfter = "";
        }
    }
    if (prevBlock.level === block.level) txtAfter = "";
    //exceptions (logseq has "-" before every block, Hugo doesn't)
    if (text.substring(0, 3) === "```") txtBefore = "";
    // Don't - indent images
    if (reImage.test(text)) txtBefore = "";
    //indent text + add newline after block
    text = txtBefore + text + txtAfter;

    //internal links
    text = parseLinks(text, allPublicPages);

    //namespaces
    text = await parseNamespaces(text, block.level);

    //youtube embed
    //Change {{youtube url}} via regex
    const reYoutube = /{{youtube(.*?)}}/g;
    text = text.replaceAll(reYoutube, (match) => {
        const youtubeRegex = /(youtu(?:.*\/v\/|.*v\=|\.be\/))([A-Za-z0-9_\-]{11})/
        const youtubeId = youtubeRegex.exec(match)
        if (youtubeId != null) {
            return `{{< youtube ${youtubeId[2]} >}}`
        }
    })


    //height and width syntax regex
    // {:height 239, :width 363}
    const heightWidthRegex = /{:height\s*[0-9]*,\s*:width\s*[0-9]*}/g
    text = text.replaceAll(heightWidthRegex, "")

    //highlighted text, not supported in hugo by default!
    re = /(==(.*?)==)/gm;
    text = text.replace(re, "{{< logseq/mark >}}$2{{< / logseq/mark >}}");

    re = /#\+BEGIN_([A-Z]*)[^\n]*\n(.*)#\+END_[^\n]*/gms;
    text = text.replace(re, "{{< logseq/org$1 >}}$2{{< / logseq/org$1 >}}");
    // text = text.toLowerCase();

    text = text.replace(/:LOGBOOK:|collapsed:: true/gi, "");
    if (text.includes("CLOCK: [")) {
        text = text.substring(0, text.indexOf("CLOCK: ["));
    }

    if (text.indexOf(`\nid:: `) === -1) {
        return text;
    } else {
        return text.substring(0, text.indexOf(`\nid:: `));
    }
}


