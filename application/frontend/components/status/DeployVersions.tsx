import { getCurrentDeployments } from "@/lib/versions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function DeployVersions() {
  const records = getCurrentDeployments();

  if (records.length === 0) {
    return (
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">デプロイバージョン</h2>
        <p className="text-sm text-muted-foreground">記録なし（deployments.db が見つかりません）</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold">デプロイバージョン</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>環境</TableHead>
            <TableHead>サービス</TableHead>
            <TableHead>バージョン</TableHead>
            <TableHead>git hash</TableHead>
            <TableHead>デプロイ日時</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((r) => (
            <TableRow key={`${r.environment}-${r.service}`}>
              <TableCell className="font-mono">{r.environment}</TableCell>
              <TableCell className="font-mono">{r.service}</TableCell>
              <TableCell className="font-mono">{r.semver}</TableCell>
              <TableCell className="font-mono text-muted-foreground">{r.git_hash}</TableCell>
              <TableCell className="text-muted-foreground">{r.deployed_at}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
