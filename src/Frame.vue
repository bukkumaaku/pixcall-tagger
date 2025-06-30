<script setup lang="ts">
import App from "./App.vue";
import { NMessageProvider, NDialogProvider } from "naive-ui";
</script>

<template>
	<n-dialog-provider>
		<n-message-provider><App></App></n-message-provider>
	</n-dialog-provider>
</template>

<style scoped></style>
