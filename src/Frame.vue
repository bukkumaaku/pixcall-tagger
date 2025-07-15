<script setup lang="ts">
import App from "./App.vue";
import { NMessageProvider, NDialogProvider, NModalProvider } from "naive-ui";
</script>

<template>
	<n-modal-provider>
		<n-dialog-provider>
			<n-message-provider><App></App></n-message-provider>
		</n-dialog-provider>
	</n-modal-provider>
</template>

<style scoped></style>
