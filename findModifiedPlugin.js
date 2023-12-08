/*
	#############################################################################################
	|	This file is prepared for execution directly in TeamCity with Node.js runner.			|
	|	In this file, you can use only Node.js API.												|
	|	Please don't use any NPM dependencies here.												|
	#############################################################################################
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const PLUGINS_FOLDER_NAME = 'plugins';

const setTeamCityEnvVariable = (variableName, value) => {
	const setCommand = `echo "##teamcity[setParameter name='env.${variableName}' value='${value}']"`;
	execSync(`${setCommand}`, { stdio: 'inherit' });
};

const getModifiedPlugins = async pathToListOfModifiedFiles => {
	try {
		const listOfModifiedFilesContentBuffer = await fs.promises.readFile(pathToListOfModifiedFiles);

		const pluginChangeRows = listOfModifiedFilesContentBuffer
			.toString()
			.split('\n')
			.filter(line => line.split('/')[0] === PLUGINS_FOLDER_NAME)
			.map(line => line.split('/')[1]);

		return Array.from(new Set(pluginChangeRows));
	} catch (error) {
		console.error(
			`An issue happened while reading the list of modified files at: "%s" Error: %O`,
			pathToListOfModifiedFiles,
			error,
		);
		throw error;
	}
};

const getPluginName = async pluginPath => {
	try {
		const fileData = await fs.promises.readFile(path.join(pluginPath, 'package.json'));
		const packageJsonConfig = JSON.parse(fileData.toString());
		return packageJsonConfig.name;
	} catch (error) {
		console.error(`An issue happened while reading package.json file. Folder: %s Error: %O`, pluginPath, error);
		throw error;
	}
};

const findModifiedPlugin = async () => {
	try {
		const pluginNameFromEnv = process.env['PLUGIN_NAME'];
		const pluginPathFromEnv = process.env['PLUGIN_PATH'];

		if (pluginNameFromEnv && pluginPathFromEnv) {
			console.log(
				'Plugin path and name specified in build parameters. Skip the detection step. Name: %s Path: %s',
				pluginNameFromEnv,
				pluginPathFromEnv,
			);
			return;
		}

		const pathToListOfModifiedFiles = process.env['PATH_TO_LIST_OF_MODIFIED_FILES'];

		if (!pathToListOfModifiedFiles) {
			throw new Error(
				'The path to the list of modified files is required for this script to work. Please define the environment variable "PATH_TO_LIST_OF_MODIFIED_FILES"!',
			);
		}

		const modifiedPlugins = await getModifiedPlugins(pathToListOfModifiedFiles);

		if (modifiedPlugins.length > 1) {
			throw new Error(
				`Changes detected in many plugin repositories. This job is supposed to be triggered on each check-in: please verify trigger configuration! Modified plugin repos: ${modifiedPlugins}`,
			);
		} else if (modifiedPlugins.length === 0) {
			throw new Error(
				'No changes detected in plugin repositories. This job was not supposed to be started: please verify trigger configuration!',
			);
		}

		const pluginFolderName = modifiedPlugins[0];
		const pluginPath = path.join(ROOT_DIR, PLUGINS_FOLDER_NAME, pluginFolderName);
		const pluginName = await getPluginName(pluginPath);

		setTeamCityEnvVariable('PLUGIN_PATH', pluginPath);
		setTeamCityEnvVariable('PLUGIN_NAME', pluginName);

		console.log('Modified plugin is "%s" at path "%s"', pluginName, pluginPath);
	} catch (error) {
		console.error('[error] an issue happened while defining PLUGIN_PATH and PLUGIN_NAME variables: %O', error);
		process.exit(1);
	}
};

findModifiedPlugin();
