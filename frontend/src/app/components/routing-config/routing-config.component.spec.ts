import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { RoutingConfigComponent } from './routing-config.component';
import { ApiService } from '../../services/api.service';
import { CoordinateDetectionService } from '../../services/coordinate-detection.service';
import { MatSnackBarModule } from '@angular/material/snack-bar';

describe('RoutingConfigComponent', () => {
  let component: RoutingConfigComponent;
  let fixture: ComponentFixture<RoutingConfigComponent>;

  beforeEach(async () => {
    const apiServiceSpy = jasmine.createSpyObj('ApiService', ['getProjections']);
    const coordServiceSpy = jasmine.createSpyObj('CoordinateDetectionService', ['getSupportedGeographicArea']);

    await TestBed.configureTestingModule({
      imports: [
        RoutingConfigComponent,
        NoopAnimationsModule,
        MatSnackBarModule
      ],
      providers: [
        { provide: ApiService, useValue: apiServiceSpy },
        { provide: CoordinateDetectionService, useValue: coordServiceSpy }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(RoutingConfigComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Simplification Level Logic', () => {
    it('should return correct tolerance for level 0 (No simplification)', () => {
      component.simplificationLevel = 0;
      expect(component.getSimplificationTolerance()).toBe(0);
    });

    it('should return correct tolerance for level 1 (Light)', () => {
      component.simplificationLevel = 1;
      expect(component.getSimplificationTolerance()).toBe(0.00001);
    });

    it('should return correct tolerance for level 2 (Medium)', () => {
      component.simplificationLevel = 2;
      expect(component.getSimplificationTolerance()).toBe(0.0001);
    });

    it('should return correct tolerance for level 3 (Strong)', () => {
      component.simplificationLevel = 3;
      expect(component.getSimplificationTolerance()).toBe(0.0005);
    });

    it('should return correct tolerance for level 4 (Straight line)', () => {
      component.simplificationLevel = 4;
      expect(component.getSimplificationTolerance()).toBe(0);
    });

    it('should return correct descriptions for each level', () => {
      component.simplificationLevel = 0;
      expect(component.getSimplificationDescription()).toContain('No simplification');

      component.simplificationLevel = 1;
      expect(component.getSimplificationDescription()).toContain('Light');
      expect(component.getSimplificationDescription()).toContain('1m');

      component.simplificationLevel = 2;
      expect(component.getSimplificationDescription()).toContain('Medium');
      expect(component.getSimplificationDescription()).toContain('10m');

      component.simplificationLevel = 3;
      expect(component.getSimplificationDescription()).toContain('Strong');
      expect(component.getSimplificationDescription()).toContain('50m');

      component.simplificationLevel = 4;
      expect(component.getSimplificationDescription()).toContain('Straight line');
    });

    it('should return contextual help for each level', () => {
      component.simplificationLevel = 0;
      expect(component.getSimplificationHelp()).toContain('all details');

      component.simplificationLevel = 1;
      expect(component.getSimplificationHelp()).toContain('detailed analysis');

      component.simplificationLevel = 2;
      expect(component.getSimplificationHelp()).toContain('compromise');

      component.simplificationLevel = 3;
      expect(component.getSimplificationHelp()).toContain('general visualizations');

      component.simplificationLevel = 4;
      expect(component.getSimplificationHelp()).toContain('straight line');
    });

    it('should default to level 2 (Medium)', () => {
      expect(component.simplificationLevel).toBe(2);
    });

    it('should set simplification level when setSimplificationLevel is called', () => {
      component.setSimplificationLevel(3);
      expect(component.simplificationLevel).toBe(3);

      component.setSimplificationLevel(0);
      expect(component.simplificationLevel).toBe(0);
    });

    it('should handle geometry options correctly', () => {
      // Test ligne droite
      component.simplificationLevel = 4;
      const config = {
        geometryOptions: {
          exportGeometry: true,
          straightLineGeometry: component.simplificationLevel === 4,
          simplifyGeometry: component.simplificationLevel > 0 && component.simplificationLevel < 4,
          simplificationTolerance: component.getSimplificationTolerance()
        }
      };
      expect(config.geometryOptions.straightLineGeometry).toBe(true);
      expect(config.geometryOptions.simplifyGeometry).toBe(false);

      // Test simplification normale
      component.simplificationLevel = 2;
      const config2 = {
        geometryOptions: {
          exportGeometry: true,
          straightLineGeometry: component.simplificationLevel === 4,
          simplifyGeometry: component.simplificationLevel > 0 && component.simplificationLevel < 4,
          simplificationTolerance: component.getSimplificationTolerance()
        }
      };
      expect(config2.geometryOptions.straightLineGeometry).toBe(false);
      expect(config2.geometryOptions.simplifyGeometry).toBe(true);

      // Test sans simplification
      component.simplificationLevel = 0;
      const config3 = {
        geometryOptions: {
          exportGeometry: true,
          straightLineGeometry: component.simplificationLevel === 4,
          simplifyGeometry: component.simplificationLevel > 0 && component.simplificationLevel < 4,
          simplificationTolerance: component.getSimplificationTolerance()
        }
      };
      expect(config3.geometryOptions.straightLineGeometry).toBe(false);
      expect(config3.geometryOptions.simplifyGeometry).toBe(false);
    });
  });
});