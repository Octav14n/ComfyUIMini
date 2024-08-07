const path = require('path');
const fs = require('fs');
const os = require('os');
const axios = require("axios");
const config = require('../config.json');
const { logInfo, logSuccess, logWarning } = require('./utils/logger');

function checkForWorkflowsFolder() {
    const workflowsFilepath = path.join(__dirname, '..', 'workflows');
    
    if (!fs.existsSync(workflowsFilepath)) {
        fs.mkdirSync(workflowsFilepath);

        logInfo(`Workflow folder not found, creating...`);
        return;
    }

    try {
        const filesList = fs.readdirSync(workflowsFilepath);
        const jsonFilesList = filesList.filter(file => path.extname(file).toLowerCase() === ".json");

        global.serverWorkflowFilenames = jsonFilesList;

        logInfo(`Found ${jsonFilesList.length} workflows in the workflow folder.`);
        return;
    } catch (err) {
        console.err('Error reading workflows folder: ', err);
        return;
    }
}

async function checkForComfyUI() {
    try {
        const responseCodeMeaning = {
            200: "ComfyUI is running."
        };

        const request = await axios.get(config.comfyui_url);
        const status = request.status;

        logSuccess(`${status}: ${responseCodeMeaning[status] || "Unknown response."}`);
    } catch (err) {
        const errorCode = err.code;

        const errorMeaning = {
            "ECONNREFUSED": "Make sure ComfyUI is running and is accessible at the URL in the config.json file."
        }

        logWarning(`${errorCode}: ${errorMeaning[errorCode] || err}`)
    }
}

function loadSelectTypes() {
    const selectTypesFromFile = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'selects.json')));

    const modelSelects = loadModelTypes();

    // Merge selectTypesFromFile into modelSelects, then set global var to that
    Object.assign(modelSelects, selectTypesFromFile);
    
    global.selects = modelSelects;
}

function loadModelTypes() {
    function recursiveFolderRead(folderPath, basePath, accepted_exts, fileList = []) {
        const files = fs.readdirSync(folderPath);
    
        files.forEach((file) => {
            const filePath = path.join(folderPath, file);
    
            const stats = fs.statSync(filePath);
    
            if (stats.isDirectory()) {
                recursiveFolderRead(filePath, basePath, accepted_exts, fileList);
            } else if (stats.isFile()) {
    
                const fileExt = path.extname(file).toLowerCase();
    
                if (accepted_exts.includes(fileExt)) {
                    const relativePath = path.relative(basePath, filePath);
                    fileList.push(relativePath);
                }
            }
        });
    
        return fileList;
    }

    const modelDirsConfigPath = path.join(__dirname, '..', 'model_dirs.json');

    if (!fs.existsSync(modelDirsConfigPath)) {
        fs.copyFileSync(path.join(__dirname, '..', 'model_dirs.example.json'), modelDirsConfigPath);
    }

    const modelDirsConfigJson = JSON.parse(fs.readFileSync(modelDirsConfigPath));

    if (!modelDirsConfigJson.checkpoint || modelDirsConfigJson.checkpoint.folder_path == "path/to/checkpoints/folder") {
        logWarning("model_dirs.json not configured, you will be unable to select models until it is set.")
        return {};
    }



    const models = {};

    for (const [modelTypeName, modelTypeInfo] of Object.entries(modelDirsConfigJson)) {
        try {
            const fileList = recursiveFolderRead(modelTypeInfo.folder_path, modelTypeInfo.folder_path, modelTypeInfo.filetypes);
    
            models[modelTypeName] = fileList;
        } catch (err) {
            if (err.code == "ENOENT") {
                logWarning(`Invalid directory for ${modelType} in model_dirs.json`);
                continue;
            }
    
            console.err("Error when reading model_dirs.json: ", err);
        }
    }

    logInfo(`Loaded ${Object.keys(models).length} model types.`);

    return models;
}

function getLocalIP() {
    function isVirtualNetwork(interfaceName) {
        const commonVirtualNetworkNames = ['vmnet', 'vboxnet', 'vethernet', 'virtualbox', 'vmware'];
        return commonVirtualNetworkNames.some(virtualNet => interfaceName.toLowerCase().startsWith(virtualNet));
    }
    
    const networkInterfaces = os.networkInterfaces();
    for (const interfaceName in networkInterfaces) {
        const addresses = networkInterfaces[interfaceName];

        for (const address of addresses) {
            if (address.family === 'IPv4' && !address.internal && !isVirtualNetwork(interfaceName)) {
                return address.address;
            }
        }
    }

    return '127.0.0.1';
}

module.exports = {
    checkForWorkflowsFolder,
    checkForComfyUI,
    loadSelectTypes,
    getLocalIP,
    loadModelTypes
}