/**
 * Tests for LocationSearchAction, the invocable used by the Essen agent's
 * Location Finder topic.
 */
@isTest
private class LocationSearchActionTest {
    @TestSetup
    static void setupTestData() {
        insert new List<Location__c>{
            new Location__c(Name = 'Bronx Clinic', Borough__c = 'Bronx', Zip_Code__c = '10451',
                            Address__c = '1 Bronx Way', Phone__c = '718-000-0001'),
            new Location__c(Name = 'Manhattan Clinic', Borough__c = 'Manhattan', Zip_Code__c = '10001',
                            Address__c = '2 Manhattan Ave', Phone__c = '212-000-0002'),
            new Location__c(Name = 'Brooklyn Clinic', Borough__c = 'Brooklyn', Zip_Code__c = '11201',
                            Address__c = '3 Brooklyn Rd', Phone__c = '718-000-0003')
        };
    }

    private static String runSearch(String term) {
        LocationSearchAction.LocationInput input = new LocationSearchAction.LocationInput();
        input.searchTerm = term;
        List<LocationSearchAction.LocationOutput> results =
            LocationSearchAction.searchLocations(
                new List<LocationSearchAction.LocationInput>{ input }
            );
        Assert.areEqual(1, results.size(), 'One output per input');
        return results[0].response;
    }

    @isTest
    static void shouldFindByBorough() {
        Test.startTest();
        String response = runSearch('Bronx');
        Test.stopTest();
        Assert.isTrue(response.contains('Bronx Clinic'), 'The Bronx clinic should be returned');
    }

    @isTest
    static void shouldFindByZipCode() {
        Test.startTest();
        String response = runSearch('11201');
        Test.stopTest();
        Assert.isTrue(response.contains('Brooklyn Clinic'), 'The zip code should resolve to Brooklyn');
    }

    @isTest
    static void shouldReturnAll_WhenBroadTermUsed() {
        Test.startTest();
        String response = runSearch('all locations');
        Test.stopTest();
        Assert.isTrue(response.contains('Bronx Clinic'), 'A broad term returns every clinic');
        Assert.isTrue(response.contains('Manhattan Clinic'), 'A broad term returns every clinic');
        Assert.isTrue(response.contains('Brooklyn Clinic'), 'A broad term returns every clinic');
    }

    @isTest
    static void shouldExtractBoroughFromSentence() {
        Test.startTest();
        String response = runSearch('what clinics do you have in the Bronx please');
        Test.stopTest();
        Assert.isTrue(response.contains('Bronx Clinic'), 'The borough is extracted from a full sentence');
    }

    @isTest
    static void shouldHandleNullInput() {
        Test.startTest();
        String response = runSearch(null);
        Test.stopTest();
        Assert.isNotNull(response, 'A null search term must not throw');
    }

    @isTest
    static void shouldHandleUnknownTerm() {
        Test.startTest();
        String response = runSearch('Antarctica');
        Test.stopTest();
        Assert.isNotNull(response, 'An unmatched term returns a message rather than throwing');
    }

    @isTest
    static void shouldProcessMultipleInputs() {
        // Given the invocable contract is a list in, list out
        LocationSearchAction.LocationInput first = new LocationSearchAction.LocationInput();
        first.searchTerm = 'Bronx';
        LocationSearchAction.LocationInput second = new LocationSearchAction.LocationInput();
        second.searchTerm = 'Manhattan';

        // When
        Test.startTest();
        List<LocationSearchAction.LocationOutput> results =
            LocationSearchAction.searchLocations(
                new List<LocationSearchAction.LocationInput>{ first, second }
            );
        Test.stopTest();

        // Then
        Assert.areEqual(2, results.size(), 'One output per input');
        Assert.isTrue(results[0].response.contains('Bronx'), 'First result matches the first term');
        Assert.isTrue(results[1].response.contains('Manhattan'), 'Second result matches the second term');
    }
}
