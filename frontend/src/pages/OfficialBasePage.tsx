import { Stack } from "@mantine/core";

import { OfficialBaseSection } from "../components/backup/OfficialBaseSection";
import PageHeader from "../components/ui/PageHeader";
import { useBackupOfficialBasePanel } from "../hooks/useBackupOfficialBasePanel";
import { bytesToHuman } from "../lib/bytes";

// Base oficial em tela própria (antes era uma aba escondida no Backup): um computador
// publica a base e os outros pegam dele.
export default function OfficialBasePage() {
  const officialBasePanel = useBackupOfficialBasePanel(true);

  return (
    <Stack gap="lg">
      <PageHeader
        title="Base oficial"
        subtitle="Um computador publica a base de produtos e os outros pegam dele."
      />
      <OfficialBaseSection
        loading={officialBasePanel.officialBaseStatusLoading}
        errorMessage={officialBasePanel.officialBaseStatusErrorMessage}
        onRetry={() => void officialBasePanel.retryStatus()}
        status={officialBasePanel.officialBaseStatus}
        roleInput={officialBasePanel.officialRoleInput}
        onRoleChange={officialBasePanel.setOfficialRoleInput}
        machineLabelInput={officialBasePanel.officialMachineLabelInput}
        onMachineLabelChange={
          officialBasePanel.setOfficialMachineLabelInput
        }
        publisherNameInput={officialBasePanel.officialPublisherNameInput}
        onPublisherNameChange={
          officialBasePanel.setOfficialPublisherNameInput
        }
        serverPortInput={officialBasePanel.officialServerPortInput}
        onServerPortChange={officialBasePanel.setOfficialServerPortInput}
        remoteServerUrlInput={
          officialBasePanel.officialRemoteServerUrlInput
        }
        onRemoteServerUrlChange={
          officialBasePanel.setOfficialRemoteServerUrlInput
        }
        serverTokenInput={officialBasePanel.officialServerTokenInput}
        onServerTokenChange={
          officialBasePanel.setOfficialServerTokenInput
        }
        onSaveServerToken={officialBasePanel.saveServerPassword}
        onRemoveServerToken={officialBasePanel.removeServerPassword}
        onSaveConfig={officialBasePanel.saveOfficialBaseConfig}
        saveConfigLoading={officialBasePanel.saveConfigLoading}
        serverSwitchLabel={officialBasePanel.serverSwitchLabel}
        serverIsRunning={officialBasePanel.serverIsRunning}
        serverToggleBusy={officialBasePanel.serverToggleBusy}
        onToggleServer={officialBasePanel.toggleLocalServer}
        onTestRemoteServer={officialBasePanel.testRemoteServer}
        testRemoteLoading={officialBasePanel.testRemoteLoading}
        remoteStatus={officialBasePanel.remoteOfficialStatus}
        notesInput={officialBasePanel.officialNotesInput}
        onNotesChange={officialBasePanel.setOfficialNotesInput}
        onPublish={officialBasePanel.confirmPublishOfficialBase}
        publishLoading={officialBasePanel.publishLoading}
        publishFailed={officialBasePanel.publishFailed}
        onApply={officialBasePanel.confirmApplyOfficialBase}
        applyLoading={officialBasePanel.applyLoading}
        formatBytes={bytesToHuman}
        historyItems={officialBasePanel.officialBaseHistory}
        historyLoading={officialBasePanel.officialBaseHistoryLoading}
        canDeleteHistory={
          officialBasePanel.officialRoleInput === "publisher"
        }
        deletePending={officialBasePanel.deletePending}
        onDeleteHistory={
          officialBasePanel.confirmDeleteOfficialBaseHistoryItem
        }
        onDeleteLatest={officialBasePanel.confirmDeleteLatestOfficialBase}
      />
    </Stack>
  );
}
