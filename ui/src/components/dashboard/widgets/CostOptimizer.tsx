import React from 'react';
import { useCostOptimizer } from '@/hooks/useCostOptimizer';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';

export function CostOptimizer() {
  const { costData: data, loading, error, refetch: refresh, applyRecommendation, dismissRecommendation } = useCostOptimizer();

  if (loading) {
    return (
      <Card className="widget-container">
        <CardHeader className="widget-header">
          <CardTitle className="widget-title">Cost Optimizer</CardTitle>
        </CardHeader>
        <CardContent className="widget-content">
          <p className="text-on-dark-secondary">Se încarcă datele...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="widget-container">
        <CardHeader className="widget-header">
          <CardTitle className="widget-title">Cost Optimizer</CardTitle>
        </CardHeader>
        <CardContent className="widget-content">
          <p className="text-status-error-dark">Eroare: {error}</p>
          <Button onClick={refresh} className="mt-2 action-button-dark secondary">Reîncercare</Button>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="widget-container">
        <CardHeader className="widget-header">
          <CardTitle className="widget-title">Cost Optimizer</CardTitle>
        </CardHeader>
        <CardContent className="widget-content">
          <p className="text-on-dark-secondary">Nu există date disponibile.</p>
        </CardContent>
      </Card>
    );
  }

  const handleApplyRecommendation = async (id: string) => {
    try {
      await applyRecommendation(id);
    } catch (err) {
      console.error('Error applying recommendation:', err);
    }
  };

  const handleApplyAll = async () => {
    try {
      // Apply all pending recommendations
      if (data && Array.isArray(data.recommendations)) {
        for (const rec of data.recommendations) {
          if (rec.status === 'pending') {
            await applyRecommendation(rec.id);
          }
        }
      }
    } catch (err) {
      console.error('Error applying all recommendations:', err);
    }
  };

  return (
    <Card className="widget-container">
      <CardHeader className="widget-header">
        <div className="flex justify-between items-center">
          <CardTitle className="widget-title">Cost Optimizer</CardTitle>
          <Button onClick={refresh} className="action-button-dark secondary">Refresh</Button>
        </div>
      </CardHeader>
      <CardContent className="widget-content">
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-on-dark-bg">Economisiri lunare estimate</h3>
          <p className="text-3xl font-bold text-status-success-dark">
            Economisește ${data.totalSavings}/lună
          </p>
          <p className="text-sm text-on-dark-secondary">
            Cost curent: ${data.currentMonthlyCost} → Cost proiectat: ${data.projectedMonthlyCost}
          </p>
        </div>

        <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Recomandări</h3>
            <Button onClick={handleApplyAll} disabled={!data.recommendations || data.recommendations.length === 0}>
              Aplică toate
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead children="Recomandare" />
                <TableHead children="Economisire" />
                <TableHead children="Acțiune" />
                <TableHead children="Status" />
                <TableHead children="" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.isArray(data.recommendations) ? data.recommendations.map((rec: any) => (
                <TableRow key={rec.id}>
                  <TableCell>
                    <div className="font-medium">{rec.title}</div>
                    <div className="text-sm text-gray-500">{rec.description}</div>
                  </TableCell>
                  <TableCell>${rec.savings}/lună</TableCell>
                  <TableCell>
                    <Badge variant={
                      rec.action === 'auto-apply' ? 'default' : 
                      rec.action === 'manual' ? 'secondary' : 'outline'
                    }>
                      {rec.action === 'auto-apply' ? 'Auto-aplicare' : 
                       rec.action === 'manual' ? 'Manual' : 'Schimbare setări'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={
                      rec.status === 'applied' ? 'default' : 
                      rec.status === 'dismissed' ? 'secondary' : 'outline'
                    }>
                      {rec.status === 'applied' ? 'Aplicat' : 
                       rec.status === 'dismissed' ? 'Respins' : 'În așteptare'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {rec.status === 'pending' && (
                      <Button 
                        size="sm" 
                        onClick={() => handleApplyRecommendation(rec.id)}
                        disabled={rec.action === 'settings-change'}
                      >
                        Aplică
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-gray-500 py-4">
                    Nu există recomandări disponibile.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="action-button-dark secondary">Afișează detalii</Button>
          <Button variant="outline" className="action-button-dark secondary">Mai târziu</Button>
        </div>
      </CardContent>
    </Card>
  );
}